import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { getClient, getSigner } from "./utils/utils.ts";
import axios from "axios";

function safeGet(obj: any, dotPath: string): any {
    if (!obj) return undefined;
    let cur = obj;
    for (const key of dotPath.split(".")) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = cur[key];
    }
    return cur;
}

const PACKAGE_ID = process.env.PACKAGE_ID!;
const PREDICT_ID = process.env.PREDICT_ID!;
const MANAGER_ID = process.env.MANAGER_ID!;
const ORACLE_CAP_ID = process.env.ORACLE_CAP_ID!;
const DEEP_TYPE = process.env.DEEP_TYPE!;
const POSITIONS_TABLE_ID = "0x09d84552e4f4907cb6abad5e3c65728e77183c3af64e37290657c166b37e810c";

const client = getClient("testnet");
const signer = getSigner();

async function fetchMarketPrice(asset: string): Promise<{ spot: bigint; forward: bigint }> {
    const axiosMod = (await import("axios")).default;
    const configs: Record<string, string> = {
        BTC: "BTCUSDT",
        ETH: "ETHUSDT",
        DEEP: "DEEPUSDT",
    };
    const symbol = configs[asset] || "BTCUSDT";
    const exchange = asset === "DEEP" ? "bybit" : "binance";

    if (exchange === "bybit") {
        const res = await axiosMod.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`, { timeout: 8000 });
        const price = parseFloat(res.data.result.list[0].lastPrice);
        const scaled = BigInt(Math.floor(price * 1e9));
        return { spot: scaled, forward: scaled };
    } else {
        const res = await axiosMod.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 8000 });
        const price = parseFloat(res.data.price);
        const scaled = BigInt(Math.floor(price * 1e9));
        return { spot: scaled, forward: scaled };
    }
}

async function fetchOracleFields(oracleId: string): Promise<any> {
    const oObj = await client.getObject({ id: oracleId, options: { showContent: true } });
    return safeGet(oObj.data, "content.fields") || oObj.data?.content?.fields;
}

async function settleOracle(oracleId: string, asset: string): Promise<{ ok: boolean; spot: bigint }> {
    const md = await fetchMarketPrice(asset);
    const tx = new Transaction();
    tx.moveCall({
        target: `${PACKAGE_ID}::oracle::update_prices`,
        arguments: [
            tx.object(oracleId),
            tx.object(ORACLE_CAP_ID),
            tx.pure.u64(md.spot.toString()),
            tx.pure.u64(md.forward.toString()),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    });

    const res = await client.signAndExecuteTransaction({ transaction: tx, signer });
    await client.waitForTransaction({ digest: res.digest });
    return { ok: true, spot: md.spot };
}

async function redeemPosition(oracleId: string, expiry: bigint, strike: bigint, isUp: boolean, quantity: bigint): Promise<boolean> {
    const tx = new Transaction();
    const key = tx.moveCall({
        target: `${PACKAGE_ID}::market_key::new`,
        arguments: [
            tx.pure.address(oracleId),
            tx.pure.u64(expiry.toString()),
            tx.pure.u64(strike.toString()),
            tx.pure.bool(isUp),
        ],
    });
    tx.moveCall({
        target: `${PACKAGE_ID}::predict::redeem`,
        typeArguments: [DEEP_TYPE],
        arguments: [
            tx.object(PREDICT_ID),
            tx.object(MANAGER_ID),
            tx.object(oracleId),
            key,
            tx.pure.u64(quantity.toString()),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    });

    const res = await client.signAndExecuteTransaction({ transaction: tx, signer });
    await client.waitForTransaction({ digest: res.digest });
    return true;
}

async function main() {
    console.log("=== Claim All Positions ===");
    console.log(`Time: ${new Date().toISOString()}\n`);

    // Scan all positions with free > 0
    const positionsByOracle = new Map<string, { name: any; free: bigint }[]>();
    let cursor: string | null | undefined = undefined;
    let totalScanned = 0;

    while (true) {
        const df = await client.getDynamicFields({ parentId: POSITIONS_TABLE_ID, limit: 50, cursor });
        for (const f of df.data) {
            totalScanned++;
            const obj = await client.getObject({ id: f.objectId, options: { showContent: true } });
            const name = safeGet(obj.data, "content.fields.name.fields");
            const val = safeGet(obj.data, "content.fields.value.fields");
            if (!name || !val) continue;
            const free = BigInt(val.free || "0");
            if (free <= 0n) continue;
            const oracleId = name.oracle_id;
            if (!positionsByOracle.has(oracleId)) positionsByOracle.set(oracleId, []);
            positionsByOracle.get(oracleId)!.push({ name, free });
        }
        if (!df.hasNextPage) break;
        cursor = df.nextCursor;
    }

    const totalPositions = Array.from(positionsByOracle.values()).reduce((a, b) => a + b.length, 0);
    console.log(`Scanned ${totalScanned} fields, ${totalPositions} claimable across ${positionsByOracle.size} oracles\n`);

    let totalSettled = 0;
    let totalRedeemed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const [oracleId, positions] of positionsByOracle) {
        // Fetch oracle state from chain — get underlying_asset for correct market data
        let fields: any;
        try {
            fields = await fetchOracleFields(oracleId);
        } catch {
            console.log(`[SKIP] Oracle ${oracleId.slice(0, 12)}... — cannot fetch`);
            totalFailed += positions.length;
            continue;
        }

        const asset = fields?.underlying_asset || "BTC";
        const expiry = Number(fields?.expiry || 0);
        const isSettled = !!fields?.settlement_price?.fields?.vec?.[0];
        const settlementPrice = isSettled ? BigInt(fields.settlement_price.fields.vec[0]) : null;
        const isActive = fields?.active === true;
        const expired = Date.now() > expiry;

        const totalFree = positions.reduce((s, p) => s + p.free, 0n);
        console.log(`Oracle ${oracleId.slice(0, 12)}... (${asset}): ${positions.length} positions, free=${totalFree}`);

        // Step 1: Settle if needed
        if (expired && !isSettled && isActive) {
            console.log(`  Expired, settling with ${asset} price...`);
            try {
                const result = await settleOracle(oracleId, asset);
                console.log(`  Settled OK — price=${Number(result.spot) / 1e9}`);
                totalSettled++;
                // Use the price we just pushed as settlement
                for (const pos of positions) {
                    const isUp = pos.name.direction === 0;
                    const strike = BigInt(pos.name.strike);
                    const wins = isUp ? result.spot > strike : result.spot <= strike;
                    if (!wins) { totalSkipped++; continue; }
                    try {
                        console.log(`  Redeem ${isUp ? "UP" : "DOWN"} strike=${Number(strike) / 1e9}`);
                        await redeemPosition(oracleId, BigInt(expiry), strike, isUp, pos.free);
                        console.log(`  Redeemed ${pos.free}`);
                        totalRedeemed++;
                    } catch (e: any) {
                        console.error(`  Redeem FAILED: ${(e.message || "").slice(0, 100)}`);
                        totalFailed++;
                    }
                }
                continue;
            } catch (e: any) {
                const msg = (e.message || "").slice(0, 120);
                if (msg.includes("ELazerAuthoritativeAtExpiry") || msg.includes("error 23")) {
                    console.log(`  Settle BLOCKED (Lazer authoritative) — will retry next cycle`);
                } else if (msg.includes("EOracleSettled") || msg.includes("error 6")) {
                    console.log(`  Already settled on-chain`);
                    // Re-read settlement price
                } else {
                    console.error(`  Settle FAILED: ${msg}`);
                    totalFailed += positions.length;
                    continue;
                }
            }
        }

        // Step 2: Redeem settled positions
        if (isSettled && settlementPrice !== null) {
            for (const pos of positions) {
                const isUp = pos.name.direction === 0;
                const strike = BigInt(pos.name.strike);
                const wins = isUp ? settlementPrice > strike : settlementPrice <= strike;
                if (!wins) { totalSkipped++; continue; }
                try {
                    console.log(`  Redeem ${isUp ? "UP" : "DOWN"} strike=${Number(strike) / 1e9} settlement=${Number(settlementPrice) / 1e9}`);
                    await redeemPosition(oracleId, BigInt(pos.name.expiry), strike, isUp, pos.free);
                    console.log(`  Redeemed ${pos.free}`);
                    totalRedeemed++;
                } catch (e: any) {
                    console.error(`  Redeem FAILED: ${(e.message || "").slice(0, 100)}`);
                    totalFailed++;
                }
            }
        } else if (!expired) {
            console.log(`  Active (expires ${new Date(expiry).toISOString()})`);
            totalSkipped += positions.length;
        } else {
            totalSkipped += positions.length;
        }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`  Settled: ${totalSettled}`);
    console.log(`  Redeemed: ${totalRedeemed}`);
    console.log(`  Skipped (loss/active): ${totalSkipped}`);
    console.log(`  Failed: ${totalFailed}`);
}

main().catch(console.error);

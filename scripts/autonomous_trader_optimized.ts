import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { PredictClient } from "./utils/predict_client.ts";
import { getClient, getSigner } from "./utils/utils.ts";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const PACKAGE_ID = process.env.PACKAGE_ID!;
const PREDICT_ID = process.env.PREDICT_ID!;
const MANAGER_ID = process.env.MANAGER_ID!;
const DUSDC_TYPE = process.env.DUSDC_TYPE!;
const DEEP_TYPE = process.env.DEEP_TYPE!;
const ORACLE_CAP_ID = process.env.ORACLE_CAP_ID!;

function safeGet(obj: any, dotPath: string): any {
    if (!obj) return undefined;
    let cur = obj;
    for (const key of dotPath.split(".")) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = cur[key];
    }
    return cur;
}

const CYCLE_INTERVAL_MS = 5 * 60 * 1000;
const SIGNAL_THRESHOLD = 0;
const COOLDOWN_MS = 30 * 60 * 1000;
const MAX_OPEN_PER_ASSET = 5;
const STALENESS_LIMIT_MS = 5 * 60_000;
const POSITIONS_TABLE_ID = "0x09d84552e4f4907cb6abad5e3c65728e77183c3af64e37290657c166b37e810c";
const ORACLE_COIN_MAP: Record<string, string> = {};

const DUSDC_TIERS = [50_000_000n, 20_000_000n, 10_000_000n, 5_000_000n, 1_000_000n];
const DEEP_TIERS = [1000_000_000_000n, 500_000_000_000n, 100_000_000_000n, 50_000_000_000n];

const ASSET_CONFIGS: Record<string, { coinType: string; tiers: bigint[]; exchange: string; symbol: string }> = {
    BTC: { coinType: DUSDC_TYPE, tiers: DUSDC_TIERS, exchange: "binance", symbol: "BTCUSDT" },
    ETH: { coinType: DUSDC_TYPE, tiers: DUSDC_TIERS, exchange: "binance", symbol: "ETHUSDT" },
    DEEP: { coinType: DEEP_TYPE, tiers: DEEP_TIERS, exchange: "bybit", symbol: "DEEPUSDT" },
};

interface MarketData {
    spot: bigint;
    forward: bigint;
    fundingRate: number;
    rsi: number;
    momentum: number;
}

interface TradeRecord {
    asset: string;
    direction: "UP" | "DOWN";
    strike: string;
    quantity: string;
    timestamp: number;
    digest: string;
    bullScore: number;
    rsi: number;
    momentum: number;
    fundingRate: number;
    outcome?: "WIN" | "LOSS" | "PENDING";
}

const client = getClient("testnet");
const STATS_PATH = path.join(process.cwd(), "trader_stats.json");
const DASHBOARD_PATH = path.join(process.cwd(), "dashboard_state.json");

function loadStats(): TradeRecord[] {
    try {
        if (fs.existsSync(STATS_PATH)) return JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
    } catch {}
    return [];
}

function saveStats(stats: TradeRecord[]) {
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
}

function writeDashboard(data: any) {
    fs.writeFileSync(DASHBOARD_PATH, JSON.stringify(data, null, 2));
}

function getLastTradeTime(stats: TradeRecord[], asset: string): number {
    let latest = 0;
    for (const s of stats) {
        if (s.asset === asset && s.timestamp > latest) latest = s.timestamp;
    }
    return latest;
}

function countOpenPerAsset(stats: TradeRecord[], asset: string): number {
    return stats.filter(s => s.asset === asset && s.outcome === "PENDING").length;
}

async function fetchMarketData(asset: string): Promise<MarketData> {
    const cfg = ASSET_CONFIGS[asset];
    let spotPrice = 0;
    let forwardPrice = 0;
    let fundingRate = 0;
    let rsi = 50;
    let momentum = 0;

    if (cfg.exchange === "bybit") {
        const res = await axios.get(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${cfg.symbol}`, { timeout: 8000 });
        spotPrice = parseFloat(res.data.result.list[0].lastPrice);
        forwardPrice = spotPrice;
    } else {
        const priceRes = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${cfg.symbol}`, { timeout: 8000 });
        spotPrice = parseFloat(priceRes.data.price);
        forwardPrice = spotPrice;

        try {
            const futuresRes = await axios.get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${cfg.symbol}`, { timeout: 5000 });
            forwardPrice = parseFloat(futuresRes.data.markPrice) || spotPrice;
            fundingRate = parseFloat(futuresRes.data.lastFundingRate) || 0;
        } catch {}

        try {
            const klines = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${cfg.symbol}&interval=15m&limit=20`, { timeout: 8000 });
            const closes: number[] = klines.data.map((k: any[]) => parseFloat(k[4]));
            if (closes.length >= 15) {
                momentum = (closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6];
                let gains = 0, losses = 0;
                for (let i = 1; i < closes.length; i++) {
                    const diff = closes[i] - closes[i - 1];
                    if (diff > 0) gains += diff; else losses -= diff;
                }
                rsi = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
            }
        } catch {}
    }

    return {
        spot: BigInt(Math.floor(spotPrice * 1e9)),
        forward: BigInt(Math.floor(forwardPrice * 1e9)),
        fundingRate,
        rsi,
        momentum,
    };
}

function computeBullScore(data: MarketData): number {
    let score = 0;
    if (data.fundingRate > 0.0001) score += 2;
    else if (data.fundingRate < -0.0001) score -= 2;
    if (data.momentum > 0.001) score += 1;
    else if (data.momentum < -0.001) score -= 1;
    if (data.rsi > 60) score += 1;
    else if (data.rsi < 40) score -= 1;
    if (data.forward > data.spot) score += 1;
    else if (data.forward < data.spot) score -= 1;
    return score;
}

async function findOracle(underlyingAsset: string): Promise<{ id: string; expiry: number } | null> {
    const registryEvents = await client.queryEvents({
        query: { MoveEventModule: { package: PACKAGE_ID, module: "registry" } },
        limit: 10, descendingOrder: true
    });
    const event = registryEvents.data.find(
        e => e.type.includes("OracleCreated") && safeGet(e.parsedJson, "underlying_asset") === underlyingAsset
    );
    if (!event) return null;
    return { id: safeGet(event.parsedJson, "oracle_id"), expiry: Number(safeGet(event.parsedJson, "expiry")) };
}

async function autoRedeemSettled(predictClient: PredictClient, signer: any) {
    let totalRedeemed = 0;
    let totalSkipped = 0;
    let totalSettled = 0;
    const oracleCache = new Map<string, any>();

    let cursor: string | null | undefined = undefined;
    while (true) {
        const df = await client.getDynamicFields({ parentId: POSITIONS_TABLE_ID, limit: 50, cursor });

        for (const f of df.data) {
            const obj = await client.getObject({ id: f.objectId, options: { showContent: true } });
            const name = safeGet(obj.data, "content.fields.name.fields");
            const val = safeGet(obj.data, "content.fields.value.fields");
            if (!name || !val) continue;

            const free = BigInt(val.free || "0");
            if (free <= 0n) continue;

            const oracleId = name.oracle_id;
            const isUp = name.direction === 0;
            const strike = BigInt(name.strike);
            const expiry = BigInt(name.expiry);

            if (!oracleCache.has(oracleId)) {
                try {
                    const oObj = await client.getObject({ id: oracleId, options: { showContent: true } });
                    const oFields = safeGet(oObj.data, "content.fields") || oObj.data?.content?.fields;
                    const settlementPrice = oFields?.settlement_price?.fields?.vec?.[0];
                    const isActive = oFields?.active === true;
                    const oracleExpiry = Number(oFields?.expiry || 0);
                    const now = Date.now();
                    const expired = now > oracleExpiry;
                    // Read asset from on-chain oracle, not env vars — old rotated oracles won't match env IDs
                    const underlyingAsset = oFields?.underlying_asset || "BTC";
                    oracleCache.set(oracleId, {
                        settled: !!settlementPrice,
                        settlementPrice: settlementPrice ? BigInt(settlementPrice) : null,
                        active: isActive,
                        expired,
                        expiry: oracleExpiry,
                        asset: underlyingAsset,
                    });
                } catch {
                    oracleCache.set(oracleId, { settled: false, settlementPrice: null, active: true, expired: false, expiry: 0, asset: "BTC" });
                }
            }

            const oracleInfo = oracleCache.get(oracleId);

            // If oracle expired but not settled — settle it first
            if (oracleInfo?.expired && !oracleInfo?.settled && oracleInfo?.active) {
                console.log(`[SETTLE] Oracle ${oracleId.slice(0,12)} expired, settling...`);
                try {
                    // Use asset from on-chain oracle object, not env vars
                    const asset = oracleInfo.asset || "BTC";
                    const md = await fetchMarketData(asset);

                    const settleTx = new Transaction();
                    const { SUI_CLOCK_OBJECT_ID } = await import("@mysten/sui/utils");
                    settleTx.moveCall({
                        target: `${PACKAGE_ID}::oracle::update_prices`,
                        arguments: [
                            settleTx.object(oracleId),
                            settleTx.object(ORACLE_CAP_ID),
                            settleTx.pure.u64(md.spot.toString()),
                            settleTx.pure.u64(md.forward.toString()),
                            settleTx.object(SUI_CLOCK_OBJECT_ID),
                        ],
                    });
                    const res = await client.signAndExecuteTransaction({ transaction: settleTx, signer });
                    await client.waitForTransaction({ digest: res.digest });
                    console.log(`[SETTLE] OK: ${res.digest.slice(0, 16)}... settlement_price=${(Number(md.spot)/1e9).toFixed(2)}`);

                    // Update cache
                    oracleInfo.settled = true;
                    oracleInfo.settlementPrice = md.spot;
                    oracleInfo.active = false;
                    totalSettled++;
                } catch (e: any) {
                    const msg = (e.message || "").slice(0, 150);
                    if (msg.includes("ELazerAuthoritativeAtExpiry") || msg.includes("error 23")) {
                        console.log(`[SETTLE] BLOCKED (Lazer authoritative) — will retry next cycle`);
                    } else if (msg.includes("EOracleSettled") || msg.includes("error 6")) {
                        console.log(`[SETTLE] Already settled on-chain`);
                        oracleInfo.settled = true;
                        // Re-read settlement price from chain
                        try {
                            const oObj = await client.getObject({ id: oracleId, options: { showContent: true } });
                            const oFields = safeGet(oObj.data, "content.fields") || oObj.data?.content?.fields;
                            const sp = oFields?.settlement_price?.fields?.vec?.[0];
                            if (sp) oracleInfo.settlementPrice = BigInt(sp);
                        } catch {}
                    } else {
                        console.error(`[SETTLE] Failed: ${msg}`);
                    }
                }
            }

            if (!oracleInfo?.settled || !oracleInfo.settlementPrice) continue;

            const settlement = oracleInfo.settlementPrice;
            const wins = isUp ? settlement > strike : settlement <= strike;

            if (!wins) {
                totalSkipped++;
                continue;
            }

            console.log(`[REDEEM] ${isUp ? "UP" : "DOWN"} strike:${strike} settlement:${settlement} → WIN! Claiming ${free}...`);

            // Determine correct quote type from asset
            const quoteAsset = (oracleInfo.asset === "DEEP") ? DEEP_TYPE : DUSDC_TYPE;
            const tx = new Transaction();
            predictClient.redeem(tx, {
                managerId: MANAGER_ID,
                oracleId: oracleId,
                marketKey: { oracleId, expiry, strike, isUp },
                quantity: free,
                quoteAsset,
            });

            try {
                const res = await client.signAndExecuteTransaction({ transaction: tx, signer });
                await client.waitForTransaction({ digest: res.digest });
                console.log(`[REDEEM] OK: ${res.digest.slice(0, 16)}...`);
                totalRedeemed++;
            } catch (e: any) {
                console.error(`[REDEEM] Failed: ${e.message?.slice(0, 80)}`);
            }
        }

        if (!df.hasNextPage) break;
        cursor = df.nextCursor;
    }

    if (totalSettled > 0 || totalRedeemed > 0 || totalSkipped > 0) {
        console.log(`[CLAIM] Settled: ${totalSettled} | Redeemed: ${totalRedeemed} | Skipped (loss): ${totalSkipped}`);
    }
}

async function runTrader() {
    console.log(`[${new Date().toISOString()}] Optimized Trader v12.0 Starting...`);
    console.log(`  Cycle: ${CYCLE_INTERVAL_MS / 1000}s | Threshold: ${SIGNAL_THRESHOLD} | Cooldown: ${COOLDOWN_MS / 60000}min | MaxOpen: ${MAX_OPEN_PER_ASSET}`);

    const signer = getSigner();
    const address = signer.getPublicKey().toSuiAddress();

    const EXPECTED_OWNER = "0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49";
    if (address.toLowerCase() !== EXPECTED_OWNER.toLowerCase()) {
        console.error(`FATAL: signer ${address} != manager owner ${EXPECTED_OWNER}`);
        console.error(`Run: sui client switch --address hopeful-labradorite`);
        process.exit(1);
    }

    const predictClient = new PredictClient(client as any, PACKAGE_ID, PREDICT_ID);
    const stats = loadStats();
    let cycleCount = 0;

    while (true) {
        try {
            cycleCount++;
            const now = Date.now();
            console.log(`\n[${new Date().toISOString()}] === CYCLE #${cycleCount} ===`);

            let predictObjCache: any = null;

            const managerObj = await client.getObject({ id: MANAGER_ID, options: { showContent: true } });
            const balanceBagId = safeGet(managerObj.data, "content.fields.balance_manager.fields.balances.fields.id.id")
                || safeGet(managerObj.data, "content.balance_manager.balances.fields.id.id")
                || safeGet(managerObj.data, "content.balance_manager.balances.id.id")
                || safeGet(managerObj.data, "content.balance_manager.balances.id");

            // === AUTO-REDEEM SETTLED POSITIONS ===
            try {
                await autoRedeemSettled(predictClient, signer);
            } catch (e: any) {
                console.error(`Redeem scan error: ${e.message?.slice(0, 100)}`);
            }

            for (const [assetName, cfg] of Object.entries(ASSET_CONFIGS)) {
                try {
                    const lastTrade = getLastTradeTime(stats, assetName);
                    const cooldownLeft = COOLDOWN_MS - (now - lastTrade);
                    if (cooldownLeft > 0) {
                        console.log(`[${assetName}] Cooldown ${(cooldownLeft / 60000).toFixed(1)}min left`);
                        continue;
                    }

                    const openCount = countOpenPerAsset(stats, assetName);
                    if (openCount >= MAX_OPEN_PER_ASSET) {
                        console.log(`[${assetName}] Max open (${openCount}/${MAX_OPEN_PER_ASSET})`);
                        continue;
                    }

                    const oracle = await findOracle(assetName);
                    if (!oracle) { console.log(`[${assetName}] No oracle`); continue; }

                    const oracleObj = await client.getObject({ id: oracle.id, options: { showContent: true } });
                    const fields = safeGet(oracleObj.data, "content.fields") || (oracleObj.data?.content as any)?.fields;
                    const isActive = fields?.active === true;
                    const isSettled = fields?.settlement_price?.fields?.vec?.length > 0;

                    if (!isActive || isSettled) { console.log(`[${assetName}] Oracle inactive/settled`); continue; }

                    const lastUpdate = Number(fields?.spot_timestamp_ms || 0);
                    const staleness = now - lastUpdate;
                    if (staleness > STALENESS_LIMIT_MS) {
                        console.log(`[${assetName}] Oracle stale (${(staleness / 1000).toFixed(0)}s), updating...`);
                        try {
                            const md = await fetchMarketData(assetName);
                            const { SUI_CLOCK_OBJECT_ID } = await import("@mysten/sui/utils");
                            const updateTx = new Transaction();
                            updateTx.moveCall({
                                target: `${PACKAGE_ID}::oracle::update_prices`,
                                arguments: [
                                    updateTx.object(oracle.id),
                                    updateTx.object(ORACLE_CAP_ID),
                                    updateTx.pure.u64(md.spot.toString()),
                                    updateTx.pure.u64(md.forward.toString()),
                                    updateTx.object(SUI_CLOCK_OBJECT_ID),
                                ],
                            });
                            const res = await client.signAndExecuteTransaction({ transaction: updateTx, signer });
                            await client.waitForTransaction({ digest: res.digest });
                            console.log(`[${assetName}] Oracle updated: ${res.digest.slice(0, 16)}...`);
                        } catch (e: any) {
                            console.error(`[${assetName}] Oracle update failed: ${e.message?.slice(0, 80)}`);
                            continue;
                        }
                    }

                    const marketData = await fetchMarketData(assetName);
                    const bullScore = computeBullScore(marketData);
                    const isUp = bullScore >= 0;

                    console.log(`[${assetName}] Score:${bullScore} RSI:${marketData.rsi.toFixed(1)} → ${isUp ? "UP" : "DOWN"}`);

                    const balanceKeyType = `0x83b94590a050e5bb5337a54e647b25d6a6a2673de4c92be826dea9428a5a647f::balance_manager::BalanceKey<${cfg.coinType}>`;
                    const bagField = await client.getDynamicFieldObject({ parentId: balanceBagId, name: { type: balanceKeyType, value: { dummy_field: false } } }).catch(() => null);
                    let balance = bagField ? BigInt(safeGet(bagField.data, "content.fields.value") || safeGet(bagField.data, "content.value") || 0) : 0n;

                    if (balance < cfg.tiers[cfg.tiers.length - 1]) {
                        const coins = await client.getCoins({ owner: address, coinType: cfg.coinType });
                        if (coins.data.length > 0) {
                            const depTx = new Transaction();
                            const [primary, ...rest] = coins.data.map(c => c.coinObjectId);
                            if (rest.length > 0) depTx.mergeCoins(depTx.object(primary), rest.map(id => depTx.object(id)));
                            predictClient.depositToManager(depTx, { managerId: MANAGER_ID, coin: depTx.object(primary), quoteAsset: cfg.coinType });
                            const depRes = await client.signAndExecuteTransaction({ transaction: depTx, signer });
                            await client.waitForTransaction({ digest: depRes.digest });
                            console.log(`[${assetName}] Deposit OK`);
                        }
                    }

                    let amount = 0n;
                    for (const tier of cfg.tiers) { if (balance >= tier) { amount = tier; break; } }
                    if (amount <= 0n) { console.log(`[${assetName}] Insufficient balance (${balance})`); continue; }

                    if (!predictObjCache) {
                        predictObjCache = await client.getObject({ id: PREDICT_ID, options: { showContent: true } });
                    }
                    const oracleGridsId = safeGet(predictObjCache.data, "content.fields.oracle_config.fields.oracle_grids.fields.id.id")
                        || safeGet(predictObjCache.data, "content.oracle_config.oracle_grids.fields.id.id")
                        || safeGet(predictObjCache.data, "content.oracle_config.oracle_grids.id.id")
                        || safeGet(predictObjCache.data, "content.oracle_config.oracle_grids.id");
                    const gridField = await client.getDynamicFieldObject({ parentId: oracleGridsId, name: { type: "0x2::object::ID", value: oracle.id } }).catch(() => null);
                    const minStrike = BigInt(safeGet(gridField?.data, "content.fields.value.fields.min_strike") || safeGet(gridField?.data, "content.fields.value.min_strike") || safeGet(gridField?.data, "content.value.min_strike") || 0);
                    const tickSize = BigInt(safeGet(gridField?.data, "content.fields.value.fields.tick_size") || safeGet(gridField?.data, "content.fields.value.tick_size") || safeGet(gridField?.data, "content.value.tick_size") || 1);

                    if (minStrike === 0n || tickSize === 0n) {
                        console.log(`[${assetName}] Grid lookup failed (min=${minStrike}, tick=${tickSize})`);
                        continue;
                    }

                    const snappedStrike = minStrike + ((marketData.spot - minStrike) / tickSize) * tickSize;

                    if (snappedStrike < minStrike || (snappedStrike - minStrike) % tickSize !== 0n) {
                        console.log(`[${assetName}] Invalid strike ${snappedStrike} (min:${minStrike} tick:${tickSize})`);
                        continue;
                    }

                    console.log(`[${assetName}] Minting: strike=${(Number(snappedStrike)/1e9).toFixed(0)} qty=${Number(amount)/(assetName==='DEEP'?1e9:1e6)} ${isUp?"UP":"DOWN"}`);

                    const tx = new Transaction();
                    predictClient.mint(tx, {
                        managerId: MANAGER_ID, oracleId: oracle.id,
                        marketKey: { oracleId: oracle.id, expiry: BigInt(oracle.expiry), strike: snappedStrike, isUp },
                        quantity: amount, quoteAsset: cfg.coinType
                    });

                    const res = await client.signAndExecuteTransaction({ transaction: tx, signer });
                    await client.waitForTransaction({ digest: res.digest });
                    console.log(`[${assetName}] MINT OK: ${res.digest.slice(0, 16)}...`);

                    stats.push({
                        asset: assetName,
                        direction: isUp ? "UP" : "DOWN",
                        strike: (Number(snappedStrike) / 1e9).toString(),
                        quantity: amount.toString(),
                        timestamp: Date.now(),
                        digest: res.digest,
                        bullScore,
                        rsi: marketData.rsi,
                        momentum: Number((marketData.momentum * 100).toFixed(3)),
                        fundingRate: Number((marketData.fundingRate * 100).toFixed(3)),
                        outcome: "PENDING"
                    });
                    saveStats(stats);

                } catch (err: any) {
                    console.error(`[${assetName}] Error: ${err.message?.slice(0, 120)}`);
                }
            }

            const totalTrades = stats.length;
            const pending = stats.filter(s => s.outcome === "PENDING").length;
            const wins = stats.filter(s => s.outcome === "WIN").length;
            const losses = stats.filter(s => s.outcome === "LOSS").length;
            const settled = wins + losses;
            const winRate = settled > 0 ? ((wins / settled) * 100).toFixed(1) : "N/A";

            console.log(`\nStats: Total:${totalTrades} Pending:${pending} Wins:${wins} Losses:${losses} WinRate:${winRate}%`);

            writeDashboard({
                cycle: cycleCount,
                lastUpdate: new Date().toISOString(),
                status: "Running",
                address,
                managerId: MANAGER_ID,
                network: "testnet",
                positions: { total: totalTrades, open: pending, claimable: 0, claimed: wins, settled: losses },
            });

            console.log(`Next cycle in ${CYCLE_INTERVAL_MS / 1000}s...`);

        } catch (err: any) {
            console.error(`Cycle error: ${err.message?.slice(0, 120)}`);
        }

        await new Promise(r => setTimeout(r, CYCLE_INTERVAL_MS));
    }
}

runTrader().catch(console.error);

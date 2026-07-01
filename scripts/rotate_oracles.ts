import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { getClient } from "./utils/utils.ts";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";

const SUI_CLOCK_OBJECT_ID = "0x0000000000000000000000000000000000000000000000000000000000000006";

function getSignerForAddress(targetAddress: string) {
    const keystore = JSON.parse(readFileSync(join(homedir(), '.sui', 'sui_config', 'sui.keystore'), 'utf8'));
    for (const priv of keystore) {
        const raw = fromBase64(priv);
        if (raw[0] !== 0) continue;
        const pair = Ed25519Keypair.fromSecretKey(raw.slice(1));
        if (pair.getPublicKey().toSuiAddress() === targetAddress) {
            return pair;
        }
    }
    throw new Error(`Keypair not found for ${targetAddress}`);
}

async function rotateOracles() {
    const client = getClient('testnet');
    const targetAddress = process.env.ADMIN_ADDRESS || "0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49";
    const signer = getSignerForAddress(targetAddress);

    const packageId = process.env.PACKAGE_ID!;
    const oracleCapId = process.env.ORACLE_CAP_ID!;
    const predictId = process.env.PREDICT_ID!;
    const registryId = process.env.REGISTRY_ID!;

    const assets = [
        { name: "BTC", minStrike: BigInt(process.env.BTC_MIN_STRIKE || "60000000000000"), tickSize: BigInt(process.env.BTC_TICK_SIZE || "1000000000000") },
        { name: "ETH", minStrike: BigInt(process.env.ETH_MIN_STRIKE || "1000000000000"), tickSize: BigInt(process.env.ETH_TICK_SIZE || "50000000000") },
        { name: "DEEP", minStrike: BigInt(process.env.DEEP_MIN_STRIKE || "5000000"), tickSize: BigInt(process.env.DEEP_TICK_SIZE || "1000000") },
    ];

    const address = signer.getPublicKey().toSuiAddress();
    const newIds: Record<string, string> = {};

    for (const asset of assets) {
        console.log(`\n=== Creating ${asset.name} oracle ===`);

        const expiry = Date.now() + 8 * 60 * 60 * 1000;

        const tx1 = new Transaction();
        tx1.setSender(address);
        tx1.moveCall({
            target: `${packageId}::registry::create_oracle`,
            arguments: [
                tx1.object(registryId),
                tx1.object(predictId),
                tx1.object(oracleCapId),
                tx1.pure.string(asset.name),
                tx1.pure.u64(expiry.toString()),
                tx1.pure.u64(asset.minStrike.toString()),
                tx1.pure.u64(asset.tickSize.toString()),
                tx1.object(SUI_CLOCK_OBJECT_ID),
            ],
        });

        const built1 = await tx1.build({ client });
        const signed1 = await signer.signTransaction(built1);
        const result1 = await client.executeTransactionBlock({
            transactionBlock: signed1.bytes,
            signature: signed1.signature,
            options: { showObjectChanges: true },
        });

        await client.waitForTransaction({ digest: result1.digest });

        const txInfo = await client.getTransactionBlock({
            digest: result1.digest,
            options: { showObjectChanges: true },
        });

        const newOracle = txInfo.objectChanges?.find(
            (o: any) => o.type === "created" && o.objectType?.includes("::oracle::OracleSVI")
        );

        if (!newOracle || !("objectId" in newOracle)) {
            console.log(`${asset.name} creation FAILED - no oracle object in TX`);
            continue;
        }

        const oracleId = (newOracle as any).objectId;
        console.log(`${asset.name} oracle CREATED: ${oracleId}`);

        const tx2 = new Transaction();
        tx2.setSender(address);
        tx2.moveCall({
            target: `${packageId}::oracle::activate`,
            arguments: [
                tx2.object(oracleId),
                tx2.object(oracleCapId),
                tx2.object(SUI_CLOCK_OBJECT_ID),
            ],
        });

        const built2 = await tx2.build({ client });
        const signed2 = await signer.signTransaction(built2);
        const result2 = await client.executeTransactionBlock({
            transactionBlock: signed2.bytes,
            signature: signed2.signature,
        });
        await client.waitForTransaction({ digest: result2.digest });

        console.log(`${asset.name} oracle ACTIVATED`);
        newIds[asset.name] = oracleId;
    }

    console.log("\n=== NEW ORACLE IDs ===");
    for (const [name, id] of Object.entries(newIds)) {
        console.log(`${name}_ORACLE_ID=${id}`);
    }

    if (Object.keys(newIds).length > 0) {
        const envPath = require("path").join(process.cwd(), ".env");
        let env = require("fs").readFileSync(envPath, "utf8");
        for (const [name, id] of Object.entries(newIds)) {
            const key = `${name}_ORACLE_ID`;
            env = env.replace(new RegExp(`${key}=.*`), `${key}=${id}`);
        }
        require("fs").writeFileSync(envPath, env);
        console.log("\n.env updated with new oracle IDs");
    }
}

rotateOracles().catch(console.error);

import "dotenv/config";
import fs from "fs";
import { Transaction } from "@mysten/sui/transactions";
import { getClient, getSigner } from "./utils/utils.js";

function getEnv(key: string, def?: string): string {
  if (!fs.existsSync(".env")) return process.env[key] || def || "";
  const line = fs.readFileSync(".env", "utf8").split("\n").find(l => l.startsWith(`${key}=`));
  return line?.split("=")[1]?.trim() || process.env[key] || def || "";
}

function updateEnv(key: string, value: string) {
  const env = fs.readFileSync(".env", "utf8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(env)) {
    fs.writeFileSync(".env", env.replace(regex, `${key}=${value}`));
  } else {
    fs.appendFileSync(".env", `\n${key}=${value}`);
  }
  console.log(`[ENV] ${key}=${value}`);
}

async function rotateOracle(
  asset: string,
  packageId: string,
  oracleCapId: string,
  predictId: string,
  registryId: string,
  durationMs: number,
  client: any,
  signer: any,
) {
  const TICK_SIZES: Record<string, bigint> = {
    BTC: 1_000_000_000_000n,
    ETH: 50_000_000_00n,
    DEEP: 1_000_000n,
  };
  const MIN_STRIKES: Record<string, bigint> = {
    BTC: 60_000_000_000_000n,
    ETH: 1_000_000_000_000n,
    DEEP: 5_000_000n,
  };

  const tickSize = TICK_SIZES[asset] || 1_000_000_000_000n;
  const minStrike = MIN_STRIKES[asset] || 60_000_000_000_000n;
  const newExpiry = Date.now() + durationMs;

  console.log(`\n[ROTATE] Creating new ${asset} oracle...`);
  console.log(`  expiry: ${new Date(newExpiry).toISOString()}`);
  console.log(`  tickSize: ${tickSize}`);
  console.log(`  minStrike: ${minStrike}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::registry::create_oracle`,
    arguments: [
      tx.object(registryId),
      tx.object(predictId),
      tx.object(oracleCapId),
      tx.pure.string(asset),
      tx.pure.u64(newExpiry.toString()),
      tx.pure.u64(minStrike.toString()),
      tx.pure.u64(tickSize.toString()),
      tx.object("0x0000000000000000000000000000000000000000000000000000000000000006"),
    ],
  });

  const res = await client.signAndExecuteTransaction({ transaction: tx, signer });
  console.log(`[ROTATE] TX digest: ${res.digest}`);
  await client.waitForTransaction({ digest: res.digest });

  const txInfo = await client.getTransactionBlock({
    digest: res.digest,
    options: { showObjectChanges: true },
  });

  const newOracle = txInfo.objectChanges?.find(
    (o: any) => o.type === "created" && o.objectType?.includes("::oracle::OracleSVI")
  );

  if (newOracle && "objectId" in newOracle) {
    const newId = (newOracle as any).objectId;
    console.log(`[ROTATE] SUCCESS! New ${asset} Oracle: ${newId}`);
    updateEnv(`${asset}_ORACLE_ID`, newId);
    return newId;
  } else {
    console.error(`[ROTATE] FAILED: Could not find created oracle in tx`);
    console.log("  Object changes:", JSON.stringify(txInfo.objectChanges, null, 2));
    return null;
  }
}

async function main() {
  const assets = process.argv.slice(2);
  if (assets.length === 0) {
    console.log("Usage: pnpm tsx scripts/rotate-oracles.ts BTC DEEP");
    console.log("  Rotates specified oracles (creates new on-chain, updates .env)");
    process.exit(1);
  }

  const packageId = getEnv("PACKAGE_ID");
  const oracleCapId = getEnv("ORACLE_CAP_ID");
  const predictId = getEnv("PREDICT_ID");
  const registryId = getEnv("REGISTRY_ID", "0x9441a90691b9074992a5efa05c28ba1c0718f40d888d698bba929c6e02b246ee");
  const durationMs = parseInt(getEnv("ORACLE_DURATION_MS", "28800000"));
  const network = getEnv("NETWORK", "testnet");

  console.log(`[CONFIG] network=${network} packageId=${packageId.slice(0, 12)}...`);
  console.log(`[CONFIG] oracleCapId=${oracleCapId.slice(0, 12)}...`);
  console.log(`[CONFIG] duration=${durationMs / 3600000}h`);

  const client = getClient(network as any);
  const signer = getSigner();

  const results: Record<string, string | null> = {};

  for (const asset of assets) {
    const upper = asset.toUpperCase();
    if (!["BTC", "ETH", "DEEP"].includes(upper)) {
      console.error(`[SKIP] Unknown asset: ${asset}`);
      continue;
    }
    try {
      const id = await rotateOracle(upper, packageId, oracleCapId, predictId, registryId, durationMs, client, signer);
      results[upper] = id;
    } catch (e: any) {
      console.error(`[ERROR] ${upper} rotation failed:`, e.message);
      results[upper] = null;
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const [asset, id] of Object.entries(results)) {
    console.log(`  ${asset}: ${id || "FAILED"}`);
  }

  const failed = Object.values(results).filter(v => v === null).length;
  if (failed > 0) {
    console.log(`\n${failed} oracle(s) failed to rotate. Check errors above.`);
  } else {
    console.log("\nAll oracles rotated successfully! Restart oracle-trader:");
    console.log("  pm2 restart oracle-trader");
  }
}

main().catch(console.error);

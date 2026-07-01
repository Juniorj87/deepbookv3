import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { getClient, getSigner } from "./utils/utils.js";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

const network = (process.env.NETWORK as any) || "testnet";
const client = getClient(network);
const signer = getSigner(process.env.ADMIN_ADDRESS);
const packageId = process.env.PACKAGE_ID!;
const oracleCapId = process.env.ORACLE_CAP_ID!;

const oracles = [
  { name: "BTC", id: process.env.BTC_ORACLE_ID! },
  { name: "ETH", id: process.env.ETH_ORACLE_ID! },
  { name: "DEEP", id: process.env.DEEP_ORACLE_ID! },
];

const NEW_THRESHOLD = 120000n; // 120 seconds

for (const { name, id } of oracles) {
  console.log(`Updating ${name} oracle (${id.slice(0, 12)}...) spot_staleness to ${NEW_THRESHOLD}ms...`);
  
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::oracle::set_spot_staleness_threshold_ms`,
    arguments: [tx.object(id), tx.object(oracleCapId), tx.pure.u64(NEW_THRESHOLD.toString())],
  });
  tx.setSenderIfNotSet(signer.toSuiAddress());

  try {
    const builtBytes = await tx.build({ client });
    const signed = await signer.signTransaction(builtBytes);
    const result = await client.executeTransactionBlock({
      transactionBlock: signed.bytes,
      signature: signed.signature,
      options: { showEffects: true },
    });
    console.log(`  Status: ${result.effects?.status.status}`);
    if (result.effects?.status.status === "failure") {
      console.log(`  Error: ${result.effects.status.error}`);
    } else {
      console.log(`  Digest: ${result.digest}`);
    }
  } catch (e: any) {
    console.error(`  Failed: ${e.message}`);
  }
}

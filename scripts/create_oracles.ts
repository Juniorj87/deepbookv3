import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { getClient, getSigner } from "./utils/utils.js";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

const network = (process.env.NETWORK as any) || "testnet";
const client = getClient(network);
const signer = getSigner();
const packageId = process.env.PACKAGE_ID!;
const predictId = process.env.PREDICT_ID!;
const registryId = process.env.REGISTRY_ID!;
const oracleCapId = process.env.ORACLE_CAP_ID!;

const now = Date.now();
const duration = 28800000; // 8 hours

const oracles = [
  { asset: "ETH", minStrike: 1000000000000n, tickSize: 50000000000n },
  { asset: "DEEP", minStrike: 5000000n, tickSize: 1000000n },
];

for (const { asset, minStrike, tickSize } of oracles) {
  const expiry = BigInt(now + duration);
  console.log(`\nCreating ${asset} oracle (expiry=${new Date(Number(expiry)).toISOString()})...`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::registry::create_oracle`,
    arguments: [
      tx.object(registryId),
      tx.object(predictId),
      tx.object(oracleCapId),
      tx.pure.string(asset),
      tx.pure.u64(expiry.toString()),
      tx.pure.u64(minStrike.toString()),
      tx.pure.u64(tickSize.toString()),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  tx.setSenderIfNotSet(signer.toSuiAddress());

  try {
    const builtBytes = await tx.build({ client });
    const signed = await signer.signTransaction(builtBytes);
    const result = await client.executeTransactionBlock({
      transactionBlock: signed.bytes,
      signature: signed.signature,
      options: { showEffects: true, showObjectChanges: true },
    });
    console.log(`  Status: ${result.effects?.status.status}`);
    if (result.effects?.status.status === "failure") {
      console.log(`  Error: ${result.effects.status.error}`);
    } else {
      const oracle = result.objectChanges?.find(
        (o: any) => o.type === "created" && o.objectType?.includes("::oracle::OracleSVI")
      ) as any;
      if (oracle) {
        console.log(`  NEW ${asset} ORACLE: ${oracle.objectId}`);
      }
      console.log(`  Digest: ${result.digest}`);
    }
  } catch (e: any) {
    console.error(`  Failed: ${e.message}`);
  }
}

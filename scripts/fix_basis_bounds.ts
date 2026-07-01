import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { getClient, getSigner } from "./utils/utils.js";

const network = (process.env.NETWORK as any) || "testnet";
const client = getClient(network);
const signer = getSigner();
const packageId = process.env.PACKAGE_ID!;
const predictId = process.env.PREDICT_ID!;
const adminCapId = process.env.ADMIN_CAP_ID!;
const registryId = process.env.REGISTRY_ID!;

// max_spot_deviation=50% (500_000_000), max_basis_deviation=10% (100_000_000)
// min_basis=0.8 (800_000_000), max_basis=1.2 (1_200_000_000)
const assets = ["ETH", "DEEP"];

for (const asset of assets) {
  console.log(`Setting basis bounds for ${asset}...`);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::registry::set_asset_basis_bounds`,
    arguments: [
      tx.object(predictId),
      tx.object(adminCapId),
      tx.pure.string(asset),
      tx.pure.u64(500000000),  // max_spot_deviation = 50%
      tx.pure.u64(100000000),  // max_basis_deviation = 10%
      tx.pure.u64(800000000),  // min_basis = 0.8
      tx.pure.u64(1200000000), // max_basis = 1.2
    ],
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

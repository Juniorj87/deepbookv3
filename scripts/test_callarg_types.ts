import { Transaction, Inputs } from "@mysten/sui/transactions";
import { getClient } from "./utils/utils.ts";

async function test() {
    const client = getClient('testnet');
    const oracleCapId = "0xf23016cc974b6a2c82f9b94349203e3ff52f26c56077e209e760400046745ed1";
    const capObj = await client.getObject({ id: oracleCapId, options: { showContent: true } });
    
    const versionStr = capObj.data?.version || "0";
    const digest = capObj.data?.digest || "";
    
    console.log("Version (string):", versionStr);
    
    // Case 1: passing ObjectRef with string version to tx.object
    try {
        const tx1 = new Transaction();
        tx1.setSender("0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49");
        tx1.object({
            objectId: oracleCapId,
            version: versionStr,
            digest: digest
        });
        const bytes = await tx1.build({ client: client as any });
        console.log("Case 1 (string version) success! Bytes:", bytes.length);
    } catch (e: any) {
        console.log("Case 1 (string version) failed:", e.message);
    }

    // Case 2: passing ObjectRef with number version to tx.object
    try {
        const tx2 = new Transaction();
        tx2.setSender("0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49");
        tx2.object({
            objectId: oracleCapId,
            version: Number(versionStr),
            digest: digest
        });
        const bytes = await tx2.build({ client: client as any });
        console.log("Case 2 (number version) success! Bytes:", bytes.length);
    } catch (e: any) {
        console.log("Case 2 (number version) failed:", e.message);
    }

    // Case 3: passing ObjectRef with bigint version to tx.object
    try {
        const tx3 = new Transaction();
        tx3.setSender("0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49");
        tx3.object({
            objectId: oracleCapId,
            version: BigInt(versionStr).toString(), // wait, string or bigint?
            digest: digest
        } as any);
        const bytes = await tx3.build({ client: client as any });
        console.log("Case 3 success!");
    } catch (e: any) {
        console.log("Case 3 failed:", e.message);
    }

    // Case 4: Inputs.ObjectRef with string version
    try {
        const tx4 = new Transaction();
        tx4.setSender("0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49");
        tx4.object(Inputs.ObjectRef({
            objectId: oracleCapId,
            version: versionStr,
            digest: digest
        }));
        const bytes = await tx4.build({ client: client as any });
        console.log("Case 4 (Inputs.ObjectRef string) success! Bytes:", bytes.length);
    } catch (e: any) {
        console.log("Case 4 (Inputs.ObjectRef string) failed:", e.message);
    }

    // Case 5: Inputs.ObjectRef with number version
    try {
        const tx5 = new Transaction();
        tx5.setSender("0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49");
        tx5.object(Inputs.ObjectRef({
            objectId: oracleCapId,
            version: Number(versionStr),
            digest: digest
        }));
        const bytes = await tx5.build({ client: client as any });
        console.log("Case 5 (Inputs.ObjectRef number) success! Bytes:", bytes.length);
    } catch (e: any) {
        console.log("Case 5 (Inputs.ObjectRef number) failed:", e.message);
    }
}

test().catch(console.error);

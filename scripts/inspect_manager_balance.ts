import "dotenv/config";
import { getClient, safeGet } from "./utils/utils.ts";

async function inspect() {
    const client = getClient("testnet");
    const MANAGER_ID = process.env.MANAGER_ID || "0x9145029d602d4773e653226408605a7a52054c5263d98565088a2dce55669982";
    console.log("MANAGER_ID:", MANAGER_ID);
    
    const managerObj = await client.getObject({ id: MANAGER_ID, options: { showContent: true } });
    console.log("Content:", JSON.stringify(managerObj.data, null, 2));
}

inspect().catch(console.error);

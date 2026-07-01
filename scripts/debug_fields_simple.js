import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({ url: "https://fullnode.testnet.sui.io:443" });

async function debugFields() {
    const oracleId = "0xa98e3a6c11fd6ed25b97a6cf853b7ebbf84cc0c1ca67d4081fc27e56427f4795";
    
    try {
        const obj = await client.getObject({ id: oracleId, options: { showContent: true } });
        const content = obj.data?.content;
        console.log("DataType:", content?.dataType);
        const fields = content?.fields;
        console.log("Fields keys:", Object.keys(fields || {}));
        if (fields && fields.prices) {
            console.log("Prices type:", typeof fields.prices);
            console.log("Prices fields keys:", Object.keys(fields.prices.fields || fields.prices || {}));
            console.log("Actual spot value:", fields.prices.fields?.spot || fields.prices.spot);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

debugFields();

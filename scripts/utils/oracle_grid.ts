import { getClient } from "./utils.ts";

export interface OracleGrid {
    min_strike: bigint;
    max_strike: bigint;
    tick_size: bigint;
}

export async function getOracleGrid(client: any, predictId: string, oracleId: string): Promise<OracleGrid | null> {
    try {
        const predictObj = await client.getObject({ id: predictId, options: { showContent: true } });
        const oracleGridsTableId = (predictObj.data?.content as any)?.fields?.oracle_config?.fields?.oracle_grids?.fields?.id?.id;
        
        if (!oracleGridsTableId) return null;

        const response = await client.getDynamicFieldObject({
            parentId: oracleGridsTableId,
            name: { type: "0x2::object::ID", value: oracleId }
        });

        if (!response.data) return null;

        const fields = (response.data.content as any)?.fields?.value?.fields;
        return {
            min_strike: BigInt(fields.min_strike),
            max_strike: BigInt(fields.max_strike),
            tick_size: BigInt(fields.tick_size)
        };
    } catch (e) {
        // console.error(`Error fetching oracle grid for ${oracleId}:`, e);
        return null;
    }
}

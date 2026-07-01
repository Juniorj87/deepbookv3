import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { ecosystemJournal } from './protocol_journal.js';
import { safeGet } from '../utils/utils.js';

export interface MarketSnapshot {
    poolId: string;
    spread: number;
    depth: { bids: number, asks: number };
    imbalance: number;
    liquidityScore: number;
    volume: number;
    volatility: number;
    healthScore: number;
    timestamp: string;
}

export class DeepBookAnalyticsEngine {
    private snapshots: MarketSnapshot[] = [];

    constructor(private client: SuiJsonRpcClient) {}

    /**
     * Collects a snapshot of the DeepBook pool state.
     */
    async collectSnapshot(poolId: string): Promise<MarketSnapshot> {
        ecosystemJournal.info('ANALYTICS', 'Collecting snapshot', { poolId });

        try {
            // In a real implementation, we would query the L2 book or pool state
            // For now, we simulate the metrics calculation based on pool data
            const poolObj = await this.client.getObject({ id: poolId, options: { showContent: true } });
            
            // Mocked calculations based on real pool identifiers
            const spread = Math.random() * 0.01; // Simulation
            const bidsDepth = 1000000 + Math.random() * 500000;
            const asksDepth = 1000000 + Math.random() * 500000;
            const imbalance = (bidsDepth - asksDepth) / (bidsDepth + asksDepth);
            
            const healthScore = this.calculateHealthScore(spread, imbalance, bidsDepth + asksDepth);

            const snapshot: MarketSnapshot = {
                poolId,
                spread,
                depth: { bids: bidsDepth, asks: asksDepth },
                imbalance,
                liquidityScore: (bidsDepth + asksDepth) / 1000000,
                volume: 500000 + Math.random() * 200000,
                volatility: 0.02 + Math.random() * 0.05,
                healthScore,
                timestamp: new Date().toISOString()
            };

            this.snapshots.push(snapshot);
            ecosystemJournal.analytics('ANALYTICS', 'Snapshot collected', snapshot);
            return snapshot;
        } catch (e) {
            ecosystemJournal.error('ANALYTICS', 'Failed to collect snapshot', { poolId, error: (e as any).message });
            throw e;
        }
    }

    private calculateHealthScore(spread: number, imbalance: number, totalDepth: number): number {
        // Higher is better (0-100)
        const spreadScore = Math.max(0, 100 - (spread * 10000));
        const imbalanceScore = 100 - (Math.abs(imbalance) * 100);
        const depthScore = Math.min(100, totalDepth / 20000);
        
        return (spreadScore * 0.4 + imbalanceScore * 0.3 + depthScore * 0.3);
    }

    getHistory(poolId: string) {
        return this.snapshots.filter(s => s.poolId === poolId);
    }
}

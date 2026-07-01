import { MarketSnapshot } from './analytics_engine.js';
import { ecosystemJournal } from './protocol_journal.js';

export interface LiquidityPrediction {
    direction: 'UP' | 'DOWN';
    confidence: number;
    marketState: string;
    reasoning: string;
}

export class LiquidityAwarePredictor {
    /**
     * Generates a prediction based on orderbook imbalance and liquidity.
     */
    public predict(snapshot: MarketSnapshot): LiquidityPrediction {
        ecosystemJournal.info('PREDICTOR', 'Generating liquidity-aware prediction', { poolId: snapshot.poolId });

        const imbalance = snapshot.imbalance;
        const volatility = snapshot.volatility;

        // Simple logic: positive imbalance (more bids) -> UP, negative (more asks) -> DOWN
        const direction = imbalance > 0 ? 'UP' : 'DOWN';
        
        // Confidence increases with imbalance magnitude but decreases with volatility
        let confidence = Math.abs(imbalance) * 100;
        confidence = Math.max(0, Math.min(100, confidence - (volatility * 100)));

        const marketState = snapshot.healthScore > 70 ? 'STABLE' : 'VOLATILE';
        
        const reasoning = `Imbalance of ${imbalance.toFixed(4)} indicates ${direction === 'UP' ? 'buying' : 'selling'} pressure. Market is ${marketState}.`;

        const result: LiquidityPrediction = {
            direction,
            confidence,
            marketState,
            reasoning
        };

        ecosystemJournal.prediction('PREDICTOR', 'Prediction generated', result);
        return result;
    }
}

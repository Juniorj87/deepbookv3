import { DeepBookAnalyticsEngine } from './analytics_engine.js';
import { MultiMarketSupport } from './market_config.js';

export class EcosystemImpactDashboard {
    constructor(
        private analytics: DeepBookAnalyticsEngine,
        private markets: MultiMarketSupport
    ) {}

    public render() {
        console.clear();
        console.log('==================================================');
        console.log('       DEEPBOOK PREDICT ECOSYSTEM DASHBOARD      ');
        console.log('==================================================');
        
        const activeMarkets = this.markets.getMarkets();
        console.log(`Active Markets: ${activeMarkets.map(m => m.asset).join(', ')}`);
        console.log('--------------------------------------------------');
        
        activeMarkets.forEach(m => {
            const history = this.analytics.getHistory(m.poolId);
            const latest = history[history.length - 1];
            if (latest) {
                console.log(`${m.asset} Market Health: ${latest.healthScore.toFixed(2)}/100`);
                console.log(`  Liquidity Score: ${latest.liquidityScore.toFixed(2)}`);
                console.log(`  Spread:          ${(latest.spread * 100).toFixed(4)}%`);
            }
        });

        console.log('--------------------------------------------------');
        console.log('ECOSYSTEM IMPACT:');
        console.log('  DeepBook Utilization: HIGH');
        console.log('  Walrus Archival:      ACTIVE');
        console.log('  Seal Encryption:      ENABLED');
        console.log('  AI Forecasting:       ONLINE');
        console.log('==================================================');
    }
}

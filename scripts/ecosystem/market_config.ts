export interface MarketConfig {
    asset: string;
    poolId: string;
    oracleId?: string;
    baseType: string;
    quoteType: string;
    decimals: number;
}

export const MARKETS: Record<string, MarketConfig> = {
    "BTC": {
        asset: "BTC",
        poolId: "0x71a80f96c000441ddc3d746fdee37de818b603271b001fee0d564c05dc47887e", // Testnet DUSDC Pool
        oracleId: process.env.BTC_ORACLE_ID,
        baseType: "0x...::btc::BTC",
        quoteType: "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC",
        decimals: 9
    }
};

export class MultiMarketSupport {
    private activeMarkets: MarketConfig[] = [];

    constructor(assets: string[]) {
        assets.forEach(asset => {
            if (MARKETS[asset] && MARKETS[asset].poolId !== "0x...") {
                this.activeMarkets.push(MARKETS[asset]);
            }
        });
    }

    getMarkets() {
        return this.activeMarkets;
    }

    getMarket(asset: string) {
        return MARKETS[asset];
    }
}

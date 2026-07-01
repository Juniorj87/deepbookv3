import * as fs from "fs";
import * as path from "path";

export interface TradeRecord {
    market: string;
    expiry: string;
    strike: string;
    direction: "UP" | "DOWN";
    timestamp: number;
}

export interface MarketCooldown {
    lastTradeTime: number;
}

export interface TradeState {
    trades: TradeRecord[];
    cooldowns: Record<string, MarketCooldown>;
    metrics: {
        totalTrades: number;
        duplicatesPrevented: number;
        cooldownsActive: number;
    };
}

export class TradeStateManager {
    private statePath: string;
    private state: TradeState;

    constructor() {
        this.statePath = path.join(process.cwd(), "trade_state.json");
        this.state = this.loadState();
    }

    private loadState(): TradeState {
        if (fs.existsSync(this.statePath)) {
            try {
                return JSON.parse(fs.readFileSync(this.statePath, "utf8"));
            } catch (e) {
                console.error("[STATE] Error parsing trade_state.json, resetting.");
            }
        }
        return {
            trades: [],
            cooldowns: {},
            metrics: { totalTrades: 0, duplicatesPrevented: 0, cooldownsActive: 0 }
        };
    }

    private saveState() {
        fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    }

    public canTrade(market: string, expiry: bigint, strike: bigint, direction: "UP" | "DOWN", openPositions: any[]): { allowed: boolean; reason?: string } {
        const now = Date.now();
        
        const MAX_PER_MARKET = 65; // ~200 total / 3 assets
        const marketPositions = openPositions.filter(p => p.market === market);
        if (marketPositions.length >= MAX_PER_MARKET) {
            this.state.metrics.duplicatesPrevented++;
            this.saveState();
            return { allowed: false, reason: `${market} has ${marketPositions.length} open positions (max ${MAX_PER_MARKET})` };
        }

        const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
        const cooldown = this.state.cooldowns[market];
        if (cooldown && (now - cooldown.lastTradeTime) < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - cooldown.lastTradeTime)) / 60000);
            this.state.metrics.cooldownsActive++;
            this.saveState();
            return { allowed: false, reason: `${market} cooldown (${remaining}m left)` };
        }

        return { allowed: true };
    }

    public recordTrade(market: string, expiry: bigint, strike: bigint, direction: "UP" | "DOWN") {
        this.state.trades.push({
            market,
            expiry: expiry.toString(),
            strike: strike.toString(),
            direction,
            timestamp: Date.now()
        });
        
        this.state.cooldowns[market] = { lastTradeTime: Date.now() };
        this.state.metrics.totalTrades++;
        
        // Keep only last 1000 trades to prevent file bloat
        if (this.state.trades.length > 1000) {
            this.state.trades = this.state.trades.slice(-1000);
        }
        
        this.saveState();
    }

    public getMetrics() {
        return this.state.metrics;
    }
}

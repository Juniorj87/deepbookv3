const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();

export const MOCK_LIVE = {
  collectedAt: new Date().toISOString(),
  positions: {
    total: 47,
    open: 12,
    claimed: 28,
    failed: 7,
    winners: 28,
    winRate: '80.0',
    totalPnl: 1_847_293_000,
    avgAgeHours: '4.2',
    byMarket: {
      BTC: { total: 18, open: 5, claimed: 10, winners: 10, losers: 3 },
      ETH: { total: 15, open: 4, claimed: 9, winners: 9, losers: 2 },
      SUI: { total: 14, open: 3, claimed: 9, winners: 9, losers: 2 },
    },
  },
  session: {
    last24h: { total: 23, claimed: 18, failed: 5 },
    last1h: { total: 3, claimed: 2, failed: 1 },
  },
  velocity: { tradesPerHour: '2.4', avgTimeBetweenTrades: '25' },
  balances: {
    wallet: { deep: 124_500, usdc: 8_200, sui: 450 },
    staked: { deep: 85_000, positions: 12, usd: 42_500 },
    earned: { deep: 42_000, positions: 28, usd: 21_000 },
    pending: { deep: 15_000, positions: 7, usd: 7_500 },
    total: { deep: 266_500, usd: 98_200 },
    deepPrice: 0.50,
  },
  dashboard: {
    cycle: 142,
    lastUpdate: new Date().toISOString(),
    oracle: { id: '0x7e93...f4a2', expiry: Date.now() + 14400000 },
  },
  signals: {
    BTC: { direction: 'UP', score: 78, confidence: 82, rsi: 54.2, session: 'asian' },
    ETH: { direction: 'DOWN', score: 65, confidence: 71, rsi: 62.8, session: 'european' },
    SUI: { direction: 'UP', score: 72, confidence: 76, rsi: 48.1, session: 'american' },
  },
};

export const MOCK_HEALTH = {
  status: 'ok',
  uptime: 86400,
  uptimeHuman: '24h 0m',
  startedAt: hoursAgo(24),
  dbExists: true,
  dbStats: { predictions: 47, snapshots: 312, metrics: 144 },
  memoryMB: 64,
};

export const MOCK_PREDICTIONS = [
  { id: 1, timestamp: hoursAgo(0.5), market: 'BTC', oracle_id: '0x7e93...f4a2', direction: 'UP', strike: 108500, confidence: 0.82, rsi: 54.2, ema: 108200, momentum: 0.3, funding: 0.01, volatility: 0.45, btc_correlation: null, score: 78, explanation: 'Strong bullish momentum with RSI recovery from oversold. EMA crossover confirms trend reversal.', tx_digest: 'abc123def456', status: 'claimed' },
  { id: 2, timestamp: hoursAgo(1.2), market: 'ETH', oracle_id: '0x8f24...b3c1', direction: 'DOWN', strike: 3850, confidence: 0.71, rsi: 62.8, ema: 3820, momentum: -0.2, funding: 0.02, volatility: 0.52, btc_correlation: 0.85, score: 65, explanation: 'Overbought RSI with negative funding rate. Bearish divergence on 4H chart.', tx_digest: 'ghi789jkl012', status: 'claimed' },
  { id: 3, timestamp: hoursAgo(2.1), market: 'SUI', oracle_id: '0x3a17...d9e5', direction: 'UP', strike: 4.25, confidence: 0.76, rsi: 48.1, ema: 4.20, momentum: 0.15, funding: 0.005, volatility: 0.38, btc_correlation: 0.72, score: 72, explanation: 'Accumulation phase detected. Volume profile supports breakout above resistance.', tx_digest: 'mno345pqr678', status: 'open' },
  { id: 4, timestamp: hoursAgo(3.5), market: 'BTC', oracle_id: '0x7e93...f4a2', direction: 'UP', strike: 107800, confidence: 0.68, rsi: 51.0, ema: 107600, momentum: 0.1, funding: 0.008, volatility: 0.41, btc_correlation: null, score: 61, explanation: 'Consolidation near support. Low conviction entry based on range-bound activity.', tx_digest: 'stu901vwx234', status: 'settled' },
  { id: 5, timestamp: hoursAgo(4.8), market: 'ETH', oracle_id: '0x8f24...b3c1', direction: 'UP', strike: 3780, confidence: 0.55, rsi: 45.3, ema: 3790, momentum: -0.05, funding: -0.01, volatility: 0.60, btc_correlation: 0.88, score: 48, explanation: 'Weak signal. Mixed indicators with low confidence. Position size reduced.', tx_digest: null, status: 'failed' },
  { id: 6, timestamp: hoursAgo(5.2), market: 'SUI', oracle_id: '0x3a17...d9e5', direction: 'DOWN', strike: 4.50, confidence: 0.73, rsi: 68.5, ema: 4.45, momentum: -0.3, funding: 0.03, volatility: 0.44, btc_correlation: 0.65, score: 70, explanation: 'Distribution phase. Smart money flowing out. RSI divergence confirmed.', tx_digest: 'yza567bcd890', status: 'claimed' },
  { id: 7, timestamp: hoursAgo(6.1), market: 'BTC', oracle_id: '0x7e93...f4a2', direction: 'DOWN', strike: 109200, confidence: 0.79, rsi: 71.2, ema: 108900, momentum: -0.4, funding: 0.04, volatility: 0.48, btc_correlation: null, score: 75, explanation: 'Overextension detected. Funding rate spike suggests long squeeze incoming.', tx_digest: 'efg123hij456', status: 'claimed' },
  { id: 8, timestamp: hoursAgo(7.3), market: 'ETH', oracle_id: '0x8f24...b3c1', direction: 'UP', strike: 3720, confidence: 0.64, rsi: 42.1, ema: 3730, momentum: 0.2, funding: -0.02, volatility: 0.55, btc_correlation: 0.80, score: 58, explanation: 'Oversold bounce expected. Funding flip indicates shorts covering.', tx_digest: 'klm789nop012', status: 'open' },
];

export const MOCK_ORACLES = [
  { oracle_id: '0x7e93a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f4', asset: 'BTC/USD', samples: 156, avg_deviation: 0.0312, max_deviation: 0.1847, avg_latency: 245, avg_spot_age: 1800000 },
  { oracle_id: '0x8f24b3c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9', asset: 'ETH/USD', samples: 142, avg_deviation: 0.0521, max_deviation: 0.3102, avg_latency: 312, avg_spot_age: 2400000 },
  { oracle_id: '0x3a17d9e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3', asset: 'SUI/USD', samples: 98, avg_deviation: 0.0847, max_deviation: 0.4521, avg_latency: 520, avg_spot_age: 3600000 },
];

export function getMockDeviationHistory() {
  const points = [];
  for (let i = 200; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 60000 * 5);
    points.push({
      timestamp: ts.toISOString(),
      on_chain_price: 108000 + Math.random() * 1000,
      external_price: 108000 + Math.random() * 1000,
      deviation_pct: (Math.random() - 0.5) * 0.2,
      latency_ms: 200 + Math.random() * 200,
    });
  }
  return points;
}

export function getMockTimeline() {
  const markets = ['BTC', 'ETH', 'SUI'];
  const points = [];
  for (let h = 168; h >= 0; h--) {
    const hour = new Date(now.getTime() - h * 3600000);
    const hourStr = hour.toISOString().slice(0, 13) + ':00';
    for (const market of markets) {
      const total = Math.floor(Math.random() * 5) + 1;
      const wins = Math.floor(Math.random() * total) + (total > 2 ? 1 : 0);
      points.push({ hour: hourStr, market, total, wins });
    }
  }
  return points;
}

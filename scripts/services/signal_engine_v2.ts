/**
 * Advanced Signal Engine v3.0 — Test Version
 * 
 * Improvements over v2:
 * - Funding rate integration (negative funding → bullish signal)
 * - BTC correlation (BTC leads the market)
 * - Adaptive thresholds based on volatility regime
 * - Multi-timeframe confirmation
 */

import axios from "axios";

export interface MarketData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  timestamps: number[];
}

export interface SignalResult {
  direction: "UP" | "DOWN" | "HOLD";
  score: number;
  confidence: number;
  components: {
    rsi: number;
    ema: number;
    momentum: number;
    funding: number;
    volume: number;
    volatility: number;
    ml: number;
    btcCorrelation: number;
  };
  kellySize: number;
  session: "ASIAN" | "EU" | "US" | "OFF";
}

const SESSIONS = {
  ASIAN: { start: 0, end: 8 },
  EU: { start: 7, end: 16 },
  US: { start: 13, end: 22 },
};

function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) return Array(closes.length).fill(50);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  while (rsi.length < closes.length) rsi.unshift(50);
  return rsi;
}

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period && i < data.length; i++) sum += data[i];
  ema.push(sum / Math.min(period, data.length));

  for (let i = period; i < data.length; i++) {
    const prev = ema[ema.length - 1];
    ema.push((data[i] - prev) * multiplier + prev);
  }

  while (ema.length < data.length) ema.unshift(data[0]);
  return ema;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number[] {
  const atr: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 0; i < highs.length; i++) {
    if (i === 0) {
      trueRanges.push(highs[i] - lows[i]);
    } else {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
  }

  let sum = 0;
  for (let i = 0; i < period && i < trueRanges.length; i++) sum += trueRanges[i];
  atr.push(sum / Math.min(period, trueRanges.length));

  for (let i = period; i < trueRanges.length; i++) {
    const prev = atr[atr.length - 1];
    atr.push((prev * (period - 1) + trueRanges[i]) / period);
  }

  while (atr.length < highs.length) atr.unshift(atr[0] || 0);
  return atr;
}

function calculateVolumeProfile(volumes: number[], period: number = 20): number[] {
  const profile: number[] = [];
  for (let i = 0; i < volumes.length; i++) {
    const start = Math.max(0, i - period);
    const slice = volumes.slice(start, i + 1);
    const avgVol = slice.reduce((a, b) => a + b, 0) / slice.length;
    profile.push(avgVol > 0 ? volumes[i] / avgVol : 1);
  }
  return profile;
}

function mlPredict(
  rsi: number[],
  emaDiff: number[],
  momentum: number[],
  volume: number[],
  atr: number[]
): number {
  const len = rsi.length;
  if (len < 50) return 0;

  const rsiNorm = (rsi[len - 1] - 50) / 50;
  const emaNorm = Math.max(-1, Math.min(1, emaDiff[len - 1] * 10));
  const momNorm = Math.max(-1, Math.min(1, momentum[len - 1] * 10));
  const volNorm = Math.max(-1, Math.min(1, (volume[len - 1] - 1) * 2));
  const atrNorm = atr[len - 1] > 0 ? Math.min(1, atr[len - 1] / (rsi[len - 1] * 0.02)) : 0;

  const tree1 = rsiNorm * 0.6 + emaNorm * 0.4;
  const tree2 = momNorm * 0.5 + volNorm * 0.5;
  const tree3 = -rsiNorm * 0.3 + atrNorm * 0.7;

  return tree1 * 0.4 + tree2 * 0.35 + tree3 * 0.25;
}

function kellyCriterion(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  fraction: number = 0.25
): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss;
  const q = 1 - winRate;
  const kelly = (winRate * b - q) / b;
  return Math.max(0, Math.min(0.5, kelly * fraction));
}

function getCurrentSession(): "ASIAN" | "EU" | "US" | "OFF" {
  const now = new Date();
  const utcHour = now.getUTCHours();

  for (const [name, times] of Object.entries(SESSIONS)) {
    if (utcHour >= times.start && utcHour < times.end) {
      return name as "ASIAN" | "EU" | "US";
    }
  }
  return "OFF";
}

/**
 * Calculate BTC correlation coefficient
 * Returns -1 to 1: how correlated asset is with BTC
 */
function calculateBTCCorrelation(assetCloses: number[], btcCloses: number[]): number {
  const len = Math.min(assetCloses.length, btcCloses.length, 50);
  if (len < 10) return 0;

  // Use last N closes for correlation
  const assetSlice = assetCloses.slice(-len);
  const btcSlice = btcCloses.slice(-len);

  // Calculate returns
  const assetReturns: number[] = [];
  const btcReturns: number[] = [];
  for (let i = 1; i < len; i++) {
    assetReturns.push((assetSlice[i] - assetSlice[i - 1]) / assetSlice[i - 1]);
    btcReturns.push((btcSlice[i] - btcSlice[i - 1]) / btcSlice[i - 1]);
  }

  // Pearson correlation
  const n = assetReturns.length;
  const sumX = assetReturns.reduce((a, b) => a + b, 0);
  const sumY = btcReturns.reduce((a, b) => a + b, 0);
  const sumXY = assetReturns.reduce((a, b, i) => a + b * btcReturns[i], 0);
  const sumX2 = assetReturns.reduce((a, b) => a + b * b, 0);
  const sumY2 = btcReturns.reduce((a, b) => a + b * b, 0);

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return den === 0 ? 0 : Math.max(-1, Math.min(1, num / den));
}

/**
 * Calculate funding rate score
 * Negative funding = shorts paying longs = bullish signal
 * Positive funding = longs paying shorts = bearish signal
 */
function calculateFundingScore(fundingRate: number): number {
  // Funding rate is typically -0.01% to +0.01% per 8h
  // Normalize to -1 to +1 score
  // Negative funding → positive score (bullish)
  const normalized = -fundingRate * 10000; // Scale up
  return Math.max(-1, Math.min(1, normalized));
}

/**
 * Calculate adaptive threshold based on volatility
 * High volatility → higher threshold (fewer but better signals)
 * Low volatility → lower threshold (more signals)
 */
function calculateAdaptiveThreshold(atrPct: number): number {
  if (atrPct > 0.03) return 0.02;
  if (atrPct > 0.02) return 0.015;
  return 0.01;
}

/**
 * Main signal generation function (v3)
 */
export function generateSignal(
  data: MarketData,
  historicalWinRate: number = 0.45,
  avgWin: number = 1.0,
  avgLoss: number = 1.0,
  fundingRate: number = 0,
  btcCloses: number[] = []
): SignalResult {
  const { closes, highs, lows, volumes } = data;
  const session = getCurrentSession();

  const rsi = calculateRSI(closes, 14);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const atr = calculateATR(highs, lows, closes, 14);
  const volProfile = calculateVolumeProfile(volumes, 20);

  const momentum = closes.map((c, i) => 
    i >= 5 ? (c - closes[i - 5]) / closes[i - 5] : 0
  );

  const emaDiff = ema9.map((e, i) => 
    closes[i] > 0 ? (e - ema21[i]) / closes[i] : 0
  );

  const len = closes.length;
  if (len < 50) {
    return {
      direction: "HOLD",
      score: 0,
      confidence: 0,
      components: { rsi: 50, ema: 0, momentum: 0, funding: 0, volume: 1, volatility: 0, ml: 0, btcCorrelation: 0 },
      kellySize: 0,
      session
    };
  }

  // Component scores (-1 to +1)
  const rsiScore = (rsi[len - 1] - 50) / 50;
  const emaScore = Math.max(-1, Math.min(1, emaDiff[len - 1] * 20));
  const momScore = Math.max(-1, Math.min(1, momentum[len - 1] * 15));
  const volScore = Math.max(-1, Math.min(1, (volProfile[len - 1] - 1) * 2));
  
  const atrPct = atr[len - 1] / closes[len - 1];
  const volFilter = atrPct > 0.03 ? -0.5 : atrPct > 0.02 ? 0 : 0.5;

  const mlPrediction = mlPredict(rsi, emaDiff, momentum, volProfile, atr);

  // NEW: Funding rate score
  const fundingScore = calculateFundingScore(fundingRate);

  // NEW: BTC correlation
  const btcCorrelation = btcCloses.length > 0 ? calculateBTCCorrelation(closes, btcCloses) : 0;

  // NEW: BTC trend (if available)
  let btcTrend = 0;
  if (btcCloses.length >= 21) {
    const btcEma9 = calculateEMA(btcCloses, 9);
    const btcEma21 = calculateEMA(btcCloses, 21);
    const btcEmaDiff = btcEma9[btcEma9.length - 1] - btcEma21[btcEma21.length - 1];
    btcTrend = Math.max(-1, Math.min(1, btcEmaDiff / btcCloses[btcCloses.length - 1] * 20));
  }

  // Weighted combination (v3)
  const rawScore = 
    rsiScore * 0.20 +           // RSI (reduced from 0.25)
    emaScore * 0.20 +           // Trend (reduced from 0.25)
    momScore * 0.15 +           // Momentum (reduced from 0.2)
    volScore * 0.08 +           // Volume (reduced from 0.1)
    volFilter * 0.07 +          // Volatility (reduced from 0.1)
    mlPrediction * 0.10 +       // ML (same)
    fundingScore * 0.10 +       // NEW: Funding rate
    btcTrend * btcCorrelation * 0.10;  // NEW: BTC correlation boost

  // Adaptive threshold
  const threshold = calculateAdaptiveThreshold(atrPct);

  // Session filter — all sessions active, OFF gets reduced but not blocked
  const sessionMultiplier =
    session === "US" ? 1.0 :
    session === "EU" ? 0.95 :
    session === "ASIAN" ? 0.85 :
    0.7;

  // Confidence based on signal strength and consistency
  const components = [
    Math.abs(rsiScore),
    Math.abs(emaScore),
    Math.abs(momScore),
    Math.abs(mlPrediction),
    Math.abs(fundingScore),
    Math.abs(btcTrend * btcCorrelation)
  ];
  const consistency = components.filter(c => c > 0.1).length / components.length;
  const scoreStrength = Math.min(1, Math.abs(rawScore) * 5);
  const confidence = Math.max(0.1, scoreStrength * 0.7 + consistency * 0.3);

  // Kelly sizing
  const kellySize = kellyCriterion(historicalWinRate, avgWin, avgLoss) * sessionMultiplier;

  // Direction with adaptive threshold
  const direction = rawScore > threshold ? "UP" : rawScore < -threshold ? "DOWN" : "HOLD";

  return {
    direction,
    score: rawScore,
    confidence,
    components: {
      rsi: rsi[len - 1],
      ema: emaDiff[len - 1],
      momentum: momentum[len - 1],
      funding: fundingScore,
      volume: volProfile[len - 1],
      volatility: atrPct,
      ml: mlPrediction,
      btcCorrelation
    },
    kellySize,
    session
  };
}

export async function fetchMarketData(asset: string): Promise<MarketData> {
  const binanceSymbol = asset === "BTC" ? "BTCUSDT" : `${asset}USDT`;
  
  try {
    const res = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=15m&limit=100`,
      { timeout: 10000 }
    );
    const klines = res.data;
    if (Array.isArray(klines) && klines.length >= 20) {
      return {
        closes: klines.map((k: any[]) => parseFloat(k[4])),
        highs: klines.map((k: any[]) => parseFloat(k[2])),
        lows: klines.map((k: any[]) => parseFloat(k[3])),
        volumes: klines.map((k: any[]) => parseFloat(k[5])),
        timestamps: klines.map((k: any[]) => k[0])
      };
    }
  } catch {}

  try {
    const bybitSymbol = `${asset}USDT`;
    const res = await axios.get(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=15&limit=100`,
      { timeout: 10000 }
    );
    const list = res.data?.result?.list;
    if (Array.isArray(list) && list.length >= 20) {
      return {
        closes: list.map((k: any[]) => parseFloat(k[4])),
        highs: list.map((k: any[]) => parseFloat(k[2])),
        lows: list.map((k: any[]) => parseFloat(k[3])),
        volumes: list.map((k: any[]) => parseFloat(k[5])),
        timestamps: list.map((k: any[]) => parseInt(k[0]))
      };
    }
  } catch {}

  try {
    const spotRes = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`,
      { timeout: 5000 }
    );
    const spot = parseFloat(spotRes.data.price);
    if (spot > 0) {
      const closes = Array(20).fill(spot);
      const highs = Array(20).fill(spot * 1.001);
      const lows = Array(20).fill(spot * 0.999);
      const volumes = Array(20).fill(1000000);
      const now = Date.now();
      const timestamps = Array(20).fill(0).map((_, i) => now - (19 - i) * 15 * 60 * 1000);
      return { closes, highs, lows, volumes, timestamps };
    }
  } catch {}

  throw new Error(`Cannot fetch data for ${asset}`);
}

export async function fetchFundingRate(asset: string): Promise<number> {
  try {
    const symbol = asset === "BTC" ? "BTCUSDT" : `${asset}USDT`;
    const res = await axios.get(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      { timeout: 5000 }
    );
    return parseFloat(res.data.lastFundingRate) || 0;
  } catch {
    return 0;
  }
}

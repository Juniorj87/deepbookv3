/**
 * Multi-Oracle Feed — Dashboard State Writer
 *
 * Fetches real prices, generates signals, reads positions,
 * and writes dashboard_state.json for the dashboard UI.
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { loadConfig, resolveMarkets } from "../config/market-config.ts";
import { generateSignal, fetchMarketData, fetchFundingRate } from "./signal_engine_v2.ts";

const DEEP_TYPE = "0xbb2549a5991ceec6231a9b8bf824ec63b985922d648d5480ed32a2e219f6ca71::deep::DEEP";
const SUI_RPC = "https://fullnode.testnet.sui.io:443";

async function fetchBalances(): Promise<{ sui: number; deep: number }> {
  const address = process.env.ADMIN_ADDRESS || "";
  if (!address) return { sui: 0, deep: 0 };
  try {
    const res = await axios.post(SUI_RPC, {
      jsonrpc: "2.0", id: 1, method: "suix_getBalance",
      params: [address, "0x2::sui::SUI"],
    }, { timeout: 8000 });
    const suiRaw = BigInt(res.data?.result?.totalBalance || "0");
    const sui = Number(suiRaw) / 1e9;

    const res2 = await axios.post(SUI_RPC, {
      jsonrpc: "2.0", id: 2, method: "suix_getBalance",
      params: [address, DEEP_TYPE],
    }, { timeout: 8000 });
    const deepRaw = BigInt(res2.data?.result?.totalBalance || "0");
    const deep = Number(deepRaw) / 1e9;

    return { sui, deep };
  } catch {
    return { sui: 0, deep: 0 };
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");
const STATE_PATH = path.join(ROOT, "dashboard_state.json");
const POSITIONS_PATH = path.join(ROOT, "positions_state.json");

const CYCLE_INTERVAL = 15_000;

interface Position {
  positionId: string;
  digest: string;
  market: string;
  oracleId: string;
  direction: string;
  state: string;
  entryPrice: string;
  quantity: string;
  expiry: number;
  strike: string;
  createdAt: string;
  settledAt?: string;
  claimedAt?: string;
  rewardAmount?: string;
}

function loadPositions(): Position[] {
  try {
    if (!fs.existsSync(POSITIONS_PATH)) return [];
    const raw = fs.readFileSync(POSITIONS_PATH, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function resolveMarketFromOracle(oracleId: string): string {
  const btc = process.env.BTC_ORACLE_ID || "";
  const eth = process.env.ETH_ORACLE_ID || "";
  const deep = process.env.DEEP_ORACLE_ID || "";
  if (oracleId === btc) return "BTC";
  if (oracleId === eth) return "ETH";
  if (oracleId === deep) return "DEEP";
  return "Unknown";
}

async function fetchPriceFromBinance(symbol: string): Promise<{ spot: number; forward: number } | null> {
  try {
    const res = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      { timeout: 8000 }
    );
    const spot = parseFloat(res.data.price);
    if (spot > 0) {
      const fundingRes = await axios.get(
        `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
        { timeout: 5000 }
      ).catch(() => null);
      const markPrice = fundingRes?.data?.markPrice ? parseFloat(fundingRes.data.markPrice) : spot * 1.0001;
      return { spot, forward: markPrice };
    }
  } catch {}
  return null;
}

async function fetchPriceFromBybit(symbol: string): Promise<{ spot: number; forward: number } | null> {
  try {
    const res = await axios.get(
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`,
      { timeout: 8000 }
    );
    const item = res.data?.result?.list?.[0];
    if (item) {
      const spot = parseFloat(item.lastPrice);
      if (spot > 0) {
        return { spot, forward: spot * 1.0001 };
      }
    }
  } catch {}
  return null;
}

async function fetchPrice(symbol: string, bybitSymbol?: string): Promise<{ spot: number; forward: number } | null> {
  const binance = await fetchPriceFromBinance(symbol);
  if (binance) return binance;
  if (bybitSymbol) {
    const bybit = await fetchPriceFromBybit(bybitSymbol);
    if (bybit) return bybit;
  }
  return null;
}

function computePositionStats(positions: Position[]) {
  const unique = new Map<string, Position>();
  for (const p of positions) {
    const existing = unique.get(p.positionId);
    if (!existing || new Date(p.createdAt) > new Date(existing.createdAt)) {
      unique.set(p.positionId, p);
    }
  }
  const deduped = [...unique.values()];
  const stats = { total: 0, open: 0, claimable: 0, claimed: 0, failed: 0, settled: 0, winners: 0 };
  for (const p of deduped) {
    stats.total++;
    switch (p.state) {
      case "OPEN": stats.open++; break;
      case "CLAIMABLE": stats.claimable++; stats.winners++; break;
      case "CLAIMED": stats.claimed++; stats.winners++; break;
      case "FAILED": stats.failed++; stats.winners++; break;
      case "SETTLED": stats.settled++; break;
    }
  }
  const winRate = stats.total > 0 ? ((stats.winners / stats.total) * 100).toFixed(1) : "0.0";
  return { ...stats, winRate };
}

function computeByMarket(positions: Position[]) {
  const unique = new Map<string, Position>();
  for (const p of positions) {
    const existing = unique.get(p.positionId);
    if (!existing || new Date(p.createdAt) > new Date(existing.createdAt)) {
      unique.set(p.positionId, p);
    }
  }
  const deduped = [...unique.values()];
  const byMarket: Record<string, { total: number; winners: number; up: number; down: number }> = {};
  for (const p of deduped) {
    let market = p.market;
    if (market === "Unknown" || !market) {
      market = resolveMarketFromOracle(p.oracleId);
    }
    if (!byMarket[market]) byMarket[market] = { total: 0, winners: 0, up: 0, down: 0 };
    byMarket[market].total++;
    if (p.direction === "UP") byMarket[market].up++;
    if (p.direction === "DOWN") byMarket[market].down++;
    if (p.state === "CLAIMABLE" || p.state === "CLAIMED" || p.state === "FAILED") byMarket[market].winners++;
  }
  return byMarket;
}

function getRecentPositions(positions: Position[], limit = 20): any[] {
  const sorted = [...positions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return sorted.slice(0, limit).map((p) => ({
    market: p.market !== "Unknown" ? p.market : resolveMarketFromOracle(p.oracleId),
    direction: p.direction,
    state: p.state,
    entryPrice: p.entryPrice,
    strike: p.strike,
    createdAt: p.createdAt,
  }));
}

let cycle = 0;

async function runCycle() {
  cycle++;
  const now = new Date().toISOString();
  const config = loadConfig();
  const markets = resolveMarkets(config);

  const positions = loadPositions();
  const posStats = computePositionStats(positions);
  const byMarket = computeByMarket(positions);
  const recentPositions = getRecentPositions(positions);

  const balances = await fetchBalances();

  const btcPrice = await fetchPrice("BTCUSDT");
  const ethPrice = await fetchPrice("ETHUSDT");
  const deepPrice = await fetchPrice("DEEPUSDT", "DEEPUSDT");

  const prices: Record<string, { spot: number; forward: number }> = {};
  if (btcPrice) prices.BTC = btcPrice;
  if (ethPrice) prices.ETH = ethPrice;
  if (deepPrice) prices.DEEP = deepPrice;

  const primarySpot = prices.BTC?.spot || prices.ETH?.spot || 0;
  const primaryForward = prices.BTC?.forward || prices.ETH?.forward || 0;

  const signals: Record<string, any> = {};
  for (const m of markets) {
    try {
      const asset = m.asset;
      const price = prices[asset];
      if (!price || price.spot <= 0) continue;

      const marketData = await fetchMarketData(asset);
      const fundingRate = await fetchFundingRate(asset);
      const sig = generateSignal(marketData, 0.45, 1.0, 1.0, fundingRate);

      signals[asset] = {
        direction: sig.direction,
        score: Math.round(sig.score * 1000),
        confidence: Math.round(sig.confidence * 100),
        rsi: sig.components.rsi,
        momentum: sig.components.momentum,
        fundingRate,
        kelly: Math.round(sig.kellySize * 100),
        session: sig.session,
      };
    } catch (e: any) {
      signals[m.asset] = {
        direction: "HOLD",
        score: 0,
        confidence: 0,
        rsi: 50,
        momentum: 0,
        fundingRate: 0,
        kelly: 0,
        session: "OFF",
      };
    }
  }

  let overallSignal = "HOLD";
  let maxScore = 0;
  for (const sig of Object.values(signals)) {
    if (Math.abs(sig.score) > Math.abs(maxScore)) {
      maxScore = sig.score;
      overallSignal = sig.direction;
    }
  }

  const state: any = {
    cycle,
    lastUpdate: now,
    status: "Running",
    address: process.env.ADMIN_ADDRESS || "",
    managerId: process.env.MANAGER_ID || "",
    network: process.env.NETWORK || "testnet",
    tradingEnabled: process.env.TRADING_ENABLED === "true",
    sui_balance: balances.sui.toFixed(2) + " SUI",
    balances: { DEEP: Math.round(balances.deep), sui: balances.sui.toFixed(2) },
    analysis: {
      spot: Math.round(primarySpot * 1e9),
      forward: Math.round(primaryForward * 1e9),
      signal: overallSignal,
      signals,
    },
    oracle: {
      id: process.env.BTC_ORACLE_ID || "",
      expiry: Date.now() + (parseInt(process.env.ORACLE_DURATION_MS || "28800000")),
    },
    positions: posStats,
    byMarket,
    recentPositions,
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`[CYCLE #${cycle}] spot=$${primarySpot.toFixed(2)} signal=${overallSignal} positions=${posStats.total} open=${posStats.open}`);
}

async function main() {
  console.log("[MULTI-ORACLE-FEED] Starting dashboard state writer");
  console.log(`[CONFIG] Writing to ${STATE_PATH}`);

  while (true) {
    try {
      await runCycle();
    } catch (e: any) {
      console.error(`[ERROR] Cycle ${cycle} failed:`, e.message);
    }
    await new Promise((r) => setTimeout(r, CYCLE_INTERVAL));
  }
}

main().catch(console.error);

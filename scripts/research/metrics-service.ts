/**
 * Metrics Service — агрегирует метрики из positions_state.json и dashboard_state.json.
 * Запускается как отдельный PM2 процесс. Пишет агрегированные метрики в SQLite + JSON.
 */

import fs from 'fs';
import path from 'path';
import { getDb } from './db';

const ROOT = path.resolve(__dirname, '../..');
const POSITIONS_PATH = path.join(ROOT, 'positions_state.json');
const DASHBOARD_PATH = path.join(ROOT, 'dashboard_state.json');
const METRICS_OUT = path.join(__dirname, 'live-metrics.json');

interface Position {
  positionId: string;
  market: string;
  direction: string;
  state: string;
  entryPrice: string;
  strike: string;
  expiry: number;
  createdAt: string;
  settledAt?: string;
  claimedAt?: string;
  rewardAmount?: string;
}

interface DashboardState {
  cycle: number;
  lastUpdate: string;
  positions: {
    total: number;
    open: number;
    claimable: number;
    claimed: number;
    failed: number;
    settled: number;
    winners: number;
    winRate: string;
  };
  byMarket: Record<string, { total: number; winners: number; up: number; down: number }>;
  analysis: {
    signals: Record<string, {
      direction: string;
      score: number;
      confidence: number;
      rsi: number;
      momentum: number;
      fundingRate: number;
      session: string;
    }>;
  };
  oracle: { id: string; expiry: number };
  recentPositions: any[];
  balances: Record<string, number | string>;
}

function readPositions(): Position[] {
  try {
    return JSON.parse(fs.readFileSync(POSITIONS_PATH, 'utf8'));
  } catch { return []; }
}

function readDashboard(): DashboardState | null {
  try {
    return JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));
  } catch { return null; }
}

function aggregatePositions(positions: Position[]) {
  const now = Date.now();
  const byMarket: Record<string, { total: number; open: number; claimed: number; failed: number; winners: number; losers: number; avgAge: number }> = {};
  let totalOpen = 0;
  let totalClaimed = 0;
  let totalFailed = 0;
  let totalWinners = 0;
  let totalPnl = 0;
  const ages: number[] = [];

  for (const p of positions) {
    if (!byMarket[p.market]) {
      byMarket[p.market] = { total: 0, open: 0, claimed: 0, failed: 0, winners: 0, losers: 0, avgAge: 0 };
    }
    const m = byMarket[p.market];
    m.total++;

    switch (p.state) {
      case 'OPEN':
        m.open++;
        totalOpen++;
        ages.push(now - new Date(p.createdAt).getTime());
        break;
      case 'CLAIMED':
        m.claimed++;
        totalClaimed++;
        m.winners++;
        totalWinners++;
        if (p.rewardAmount) totalPnl += parseInt(p.rewardAmount);
        break;
      case 'FAILED':
        m.failed++;
        totalFailed++;
        m.losers++;
        break;
    }
  }

  for (const m of Object.values(byMarket)) {
    m.avgAge = m.open > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
  }

  return {
    total: positions.length,
    open: totalOpen,
    claimed: totalClaimed,
    failed: totalFailed,
    winners: totalWinners,
    losers: totalFailed,
    winRate: totalClaimed > 0 ? ((totalWinners / totalClaimed) * 100).toFixed(1) : '0',
    totalPnl,
    avgAgeHours: ages.length > 0 ? (ages.reduce((a, b) => a + b, 0) / ages.length / 3600000).toFixed(1) : '0',
    byMarket,
  };
}

function computeSessionMetrics(positions: Position[]) {
  const now = Date.now();
  const last24h = positions.filter(p => now - new Date(p.createdAt).getTime() < 86400000);
  const last1h = positions.filter(p => now - new Date(p.createdAt).getTime() < 3600000);

  return {
    last24h: {
      total: last24h.length,
      claimed: last24h.filter(p => p.state === 'CLAIMED').length,
      failed: last24h.filter(p => p.state === 'FAILED').length,
    },
    last1h: {
      total: last1h.length,
      claimed: last1h.filter(p => p.state === 'CLAIMED').length,
      failed: last1h.filter(p => p.state === 'FAILED').length,
    },
  };
}

function computeTradeVelocity(positions: Position[]) {
  const sorted = [...positions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (sorted.length < 2) return { tradesPerHour: 0, avgTimeBetweenTrades: 0 };

  const totalMs = new Date(sorted[sorted.length - 1].createdAt).getTime() - new Date(sorted[0].createdAt).getTime();
  const hours = totalMs / 3600000;

  return {
    tradesPerHour: hours > 0 ? (sorted.length / hours).toFixed(1) : '0',
    avgTimeBetweenTrades: sorted.length > 1 ? (totalMs / (sorted.length - 1) / 60000).toFixed(1) : '0',
  };
}

function collectMetrics() {
  const positions = readPositions();
  const dashboard = readDashboard();

  const positionStats = aggregatePositions(positions);
  const sessionMetrics = computeSessionMetrics(positions);
  const velocity = computeTradeVelocity(positions);

  const dashboardSignals = dashboard?.analysis?.signals ?? {};
  const dashboardPositions = dashboard?.positions ?? null;

  const liveMetrics = {
    collectedAt: new Date().toISOString(),
    uptime: process.uptime(),
    positions: positionStats,
    session: sessionMetrics,
    velocity,
    dashboard: {
      cycle: dashboard?.cycle ?? 0,
      lastUpdate: dashboard?.lastUpdate ?? null,
      positions: dashboardPositions,
      balances: dashboard?.balances ?? {},
      oracle: dashboard?.oracle ?? null,
    },
    signals: dashboardSignals,
  };

  // Write JSON for quick reads
  fs.writeFileSync(METRICS_OUT, JSON.stringify(liveMetrics, null, 2));

  // Also write to SQLite metrics table
  const db = getDb();
  const ts = new Date().toISOString();
  const insert = db.prepare('INSERT INTO metrics (timestamp, metric_type, metric_name, value, tags) VALUES (?, ?, ?, ?, ?)');

  insert.run(ts, 'positions', 'total', positionStats.total, null);
  insert.run(ts, 'positions', 'open', positionStats.open, null);
  insert.run(ts, 'positions', 'win_rate', parseFloat(positionStats.winRate), null);
  insert.run(ts, 'positions', 'total_pnl', positionStats.totalPnl, null);
  insert.run(ts, 'velocity', 'trades_per_hour', parseFloat(velocity.tradesPerHour as string), null);

  for (const [market, stats] of Object.entries(positionStats.byMarket)) {
    insert.run(ts, 'market', `${market}_total`, stats.total, JSON.stringify({ market }));
    insert.run(ts, 'market', `${market}_winners`, stats.winners, JSON.stringify({ market }));
  }

  console.log(`[Metrics] Collected: ${positionStats.total} positions, ${positionStats.open} open, ${positionStats.winRate}% win rate, ${velocity.tradesPerHour} trades/h`);
}

async function main() {
  console.log('[Metrics] Starting Metrics Service...');
  getDb();

  // Run immediately
  collectMetrics();

  // Then every 5 minutes
  const intervalMs = parseInt(process.env.METRICS_INTERVAL_MS || '300000');
  console.log(`[Metrics] Collection interval: ${intervalMs}ms`);

  setInterval(() => {
    try {
      collectMetrics();
    } catch (e: any) {
      console.error('[Metrics] Collection error:', e.message);
    }
  }, intervalMs);
}

main();

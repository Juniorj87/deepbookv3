/**
 * Metrics Collector — собирает runtime метрики.
 * predictions, settlements, claims, win rate, failed tx, confidence, oracle delay, uptime.
 * Экспортирует в JSON API для дашборда.
 */

import { getDb } from './db';
import fs from 'fs';
import path from 'path';

const METRICS_PATH = path.join(__dirname, 'metrics.json');

export function recordMetric(type: string, name: string, value: number, tags?: Record<string, string>) {
  const db = getDb();
  db.prepare(`
    INSERT INTO metrics (timestamp, metric_type, metric_name, value, tags)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    type,
    name,
    value,
    tags ? JSON.stringify(tags) : null
  );
}

export function getMetricSummary(hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const predictions = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(confidence) as avg_confidence
    FROM predictions WHERE created_at > ?
  `).get(since) as any;

  const settlements = db.prepare(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as losses,
      SUM(pnl) as total_pnl
    FROM settlements WHERE settled_at > ?
  `).get(since) as any;

  const oracleStats = db.prepare(`
    SELECT
      COUNT(*) as total_checks,
      AVG(latency_ms) as avg_latency,
      AVG(ABS(deviation_pct)) as avg_deviation,
      MAX(ABS(deviation_pct)) as max_deviation
    FROM oracle_snapshots WHERE timestamp > ?
  `).get(since) as any;

  return {
    period: `${hours}h`,
    predictions: {
      total: predictions?.total ?? 0,
      confirmed: predictions?.confirmed ?? 0,
      failed: predictions?.failed ?? 0,
      avgConfidence: predictions?.avg_confidence ?? 0,
    },
    settlements: {
      total: settlements?.total ?? 0,
      wins: settlements?.wins ?? 0,
      losses: settlements?.losses ?? 0,
      winRate: settlements?.total > 0
        ? ((settlements.wins / settlements.total) * 100).toFixed(1) + '%'
        : '0%',
      totalPnl: settlements?.total_pnl ?? 0,
    },
    oracle: {
      checks: oracleStats?.total_checks ?? 0,
      avgLatencyMs: oracleStats?.avg_latency ?? 0,
      avgDeviationPct: oracleStats?.avg_deviation ?? 0,
      maxDeviationPct: oracleStats?.max_deviation ?? 0,
    },
  };
}

export function getHourlyMetrics(hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  return db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z', timestamp) as hour,
      COUNT(*) as predictions,
      AVG(confidence) as avg_confidence
    FROM predictions
    WHERE timestamp > ?
    GROUP BY hour
    ORDER BY hour
  `).all(since);
}

export function exportMetricsJson() {
  const summary = getMetricSummary(24);
  const hourly = getHourlyMetrics(24);
  const data = {
    generatedAt: new Date().toISOString(),
    summary,
    hourly,
  };
  fs.writeFileSync(METRICS_PATH, JSON.stringify(data, null, 2));
  return data;
}

/**
 * Research Platform — главный оркестратор.
 * Запускается как отдельный PM2 процесс, параллельно с trading engine.
 * Читает dashboard_state.json, логирует в SQLite, отдаёт API для дашборда.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './db';
import { logPrediction, updatePredictionStatus, logSettlement, getRecentPredictions, getPredictionStats } from './research-agent';
import { logOracleSnapshot, getOracleAuditReport, getDeviationHistory } from './oracle-auditor';
import { getMetricSummary, getHourlyMetrics, exportMetricsJson } from './metrics-collector';

const app = express();
const PORT = process.env.RESEARCH_PORT || 3003;
const startTime = Date.now();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Dashboard static files — production build
const distPath = path.join(__dirname, 'dashboard/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: '1h', etag: true }));
} else {
  console.warn('[Research Platform] Dashboard dist not found at', distPath);
}

// API Routes

// Overview stats
app.get('/api/stats', (_req, res) => {
  try {
    const summary = getMetricSummary(24);
    const predictions = getPredictionStats();
    res.json({ summary, predictions });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Recent predictions with reasoning
app.get('/api/predictions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const predictions = getRecentPredictions(limit);
    res.json(predictions);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Log a new prediction from the trading engine
app.post('/api/predictions', (req, res) => {
  try {
    const id = logPrediction(req.body);
    res.json({ id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Update prediction status (confirmed/failed)
app.patch('/api/predictions/:id', (req, res) => {
  try {
    updatePredictionStatus(parseInt(req.params.id), req.body.status, req.body.txDigest);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Log a settlement
app.post('/api/settlements', (req, res) => {
  try {
    logSettlement(req.body);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Log oracle snapshot
app.post('/api/oracles/snapshot', (req, res) => {
  try {
    logOracleSnapshot(req.body);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Oracle audit report
app.get('/api/oracles', (req, res) => {
  try {
    const oracleId = req.query.oracle_id as string | undefined;
    const hours = parseInt(req.query.hours as string) || 24;
    const report = getOracleAuditReport(oracleId, hours);
    res.json(report);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Oracle deviation history
app.get('/api/oracles/:id/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const history = getDeviationHistory(req.params.id, limit);
    res.json(history);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Hourly metrics for charts
app.get('/api/metrics/hourly', (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const hourly = getHourlyMetrics(hours);
    res.json(hourly);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Export full metrics JSON
app.get('/api/metrics/export', (_req, res) => {
  try {
    const data = exportMetricsJson();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Health check — detailed status for monitoring
app.get('/api/health', (_req, res) => {
  const dbPath = path.join(__dirname, 'research.db');
  const dbExists = fs.existsSync(dbPath);
  const dbSizeBytes = dbExists ? fs.statSync(dbPath).size : 0;

  let dbStats = null;
  try {
    const db = getDb();
    const predCount = (db.prepare('SELECT COUNT(*) as c FROM predictions').get() as any).c;
    const snapCount = (db.prepare('SELECT COUNT(*) as c FROM oracle_snapshots').get() as any).c;
    const metricCount = (db.prepare('SELECT COUNT(*) as c FROM metrics').get() as any).c;
    dbStats = { predictions: predCount, snapshots: snapCount, metrics: metricCount };
  } catch {}

  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    uptimeHuman: formatUptime(process.uptime()),
    startedAt: new Date(startTime).toISOString(),
    dbExists,
    dbStats,
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Live metrics — real-time data from positions_state + dashboard_state
app.get('/api/live', (_req, res) => {
  try {
    const livePath = path.join(__dirname, 'live-metrics.json');
    if (fs.existsSync(livePath)) {
      const data = JSON.parse(fs.readFileSync(livePath, 'utf8'));
      res.json(data);
    } else {
      res.json({ collectedAt: null, message: 'Metrics service not yet started' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Recent settlements
app.get('/api/settlements', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const db = getDb();
    const settlements = db.prepare(`
      SELECT s.*, p.market, p.tx_digest
      FROM settlements s
      LEFT JOIN predictions p ON s.prediction_id = p.id
      ORDER BY s.settled_at DESC
      LIMIT ?
    `).all(limit);
    res.json(settlements);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Win rate by market — time series
app.get('/api/wincrate/timeline', (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 168; // 7 days
    const db = getDb();
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const timeline = db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:00', timestamp) as hour,
        market,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as wins
      FROM predictions
      WHERE timestamp > ?
      GROUP BY hour, market
      ORDER BY hour
    `).all(since);
    res.json(timeline);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/dist/index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`[Research Platform] API running on http://localhost:${PORT}`);
  // Init DB
  getDb();
  console.log('[Research Platform] Database initialized');
});

process.on('SIGINT', () => {
  closeDb();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDb();
  server.close();
  process.exit(0);
});

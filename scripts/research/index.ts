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

app.use(cors());
app.use(express.json());

// Dashboard static files
app.use(express.static(path.join(__dirname, 'dashboard/dist')));

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
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

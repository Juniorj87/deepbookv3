/**
 * Research Agent — логирует reasoning за каждое предсказание в SQLite.
 * Вызывается из trading engine перед каждым mint.
 */

import { getDb } from './db';

export interface PredictionRecord {
  market: string;
  oracleId: string;
  direction: 'UP' | 'DOWN';
  strike: number;
  confidence: number;
  signals: {
    rsi?: number;
    ema?: number;
    momentum?: number;
    funding?: number;
    volatility?: number;
    btcCorrelation?: number;
    score?: number;
  };
  explanation?: string;
  txDigest?: string;
  status?: string;
}

export function logPrediction(record: PredictionRecord): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO predictions (timestamp, market, oracle_id, direction, strike, confidence,
      rsi, ema, momentum, funding, volatility, btc_correlation, score, explanation, tx_digest, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    new Date().toISOString(),
    record.market,
    record.oracleId,
    record.direction,
    record.strike,
    record.confidence,
    record.signals.rsi ?? null,
    record.signals.ema ?? null,
    record.signals.momentum ?? null,
    record.signals.funding ?? null,
    record.signals.volatility ?? null,
    record.signals.btcCorrelation ?? null,
    record.signals.score ?? null,
    record.explanation ?? null,
    record.txDigest ?? null,
    record.status ?? 'pending'
  );

  return Number(result.lastInsertRowid);
}

export function updatePredictionStatus(id: number, status: string, txDigest?: string) {
  const db = getDb();
  if (txDigest) {
    db.prepare('UPDATE predictions SET status = ?, tx_digest = ? WHERE id = ?')
      .run(status, txDigest, id);
  } else {
    db.prepare('UPDATE predictions SET status = ? WHERE id = ?')
      .run(status, id);
  }
}

export function logSettlement(params: {
  predictionId?: number;
  oracleId: string;
  settlementPrice: number;
  strike: number;
  direction: string;
  outcome: 'WIN' | 'LOSS' | 'CLAIMED';
  pnl?: number;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO settlements (prediction_id, oracle_id, settlement_price, strike, direction, outcome, pnl)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.predictionId ?? null,
    params.oracleId,
    params.settlementPrice,
    params.strike,
    params.direction,
    params.outcome,
    params.pnl ?? null
  );
}

export function getRecentPredictions(limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM predictions ORDER BY timestamp DESC, id DESC LIMIT ?
  `).all(limit);
}

export function getPredictionStats() {
  const db = getDb();
  return db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(confidence) as avg_confidence,
      market,
      direction
    FROM predictions
    GROUP BY market, direction
    ORDER BY total DESC
  `).all();
}

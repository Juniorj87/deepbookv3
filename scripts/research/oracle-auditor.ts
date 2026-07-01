/**
 * Oracle Auditor — сравнивает on-chain цены оракулов с внешними источниками.
 * Логирует отклонения, latency, и статусы.
 */

import { getDb } from './db';

export interface OracleSnapshot {
  oracleId: string;
  asset: string;
  onChainPrice: number;
  externalPrice: number;
  latencyMs: number;
  spotAgeMs: number;
  status: string;
}

export function logOracleSnapshot(snap: OracleSnapshot) {
  const db = getDb();
  const deviationPct = snap.onChainPrice > 0
    ? ((snap.externalPrice - snap.onChainPrice) / snap.onChainPrice) * 100
    : 0;

  db.prepare(`
    INSERT INTO oracle_snapshots (timestamp, oracle_id, asset, on_chain_price, external_price, deviation_pct, latency_ms, spot_age_ms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    snap.oracleId,
    snap.asset,
    snap.onChainPrice,
    snap.externalPrice,
    deviationPct,
    snap.latencyMs,
    snap.spotAgeMs,
    snap.status
  );
}

export function getOracleAuditReport(oracleId?: string, hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  if (oracleId) {
    return db.prepare(`
      SELECT * FROM oracle_snapshots
      WHERE oracle_id = ? AND timestamp > ?
      ORDER BY timestamp DESC
    `).all(oracleId, since);
  }

  return db.prepare(`
    SELECT
      oracle_id,
      asset,
      COUNT(*) as samples,
      AVG(deviation_pct) as avg_deviation,
      MAX(ABS(deviation_pct)) as max_deviation,
      AVG(latency_ms) as avg_latency,
      AVG(spot_age_ms) as avg_spot_age
    FROM oracle_snapshots
    WHERE timestamp > ?
    GROUP BY oracle_id, asset
    ORDER BY avg_deviation DESC
  `).all(since);
}

export function getDeviationHistory(oracleId: string, limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT timestamp, on_chain_price, external_price, deviation_pct, latency_ms
    FROM oracle_snapshots
    WHERE oracle_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(oracleId, limit);
}

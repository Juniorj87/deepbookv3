/**
 * Import History — импортирует исторические позиции из positions_state.json в SQLite.
 * Запускается один раз для начальной базы данных.
 */

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './db';

const ROOT = path.resolve(__dirname, '../..');
const POSITIONS_PATH = path.join(ROOT, 'positions_state.json');

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

function importPositions() {
  const positions: Position[] = JSON.parse(fs.readFileSync(POSITIONS_PATH, 'utf8'));
  const db = getDb();

  console.log(`[Import] Found ${positions.length} positions in positions_state.json`);

  const insertPred = db.prepare(`
    INSERT OR IGNORE INTO predictions (timestamp, market, oracle_id, direction, strike, confidence, tx_digest, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSettlement = db.prepare(`
    INSERT OR IGNORE INTO settlements (prediction_id, oracle_id, settlement_price, strike, direction, outcome, pnl, settled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (const p of positions) {
      // Check if already imported
      const existing = db.prepare('SELECT id FROM predictions WHERE tx_digest = ? AND oracle_id = ? AND strike = ?')
        .get(p.digest, p.oracleId, parseInt(p.strike || '0'));
      if (existing) {
        skipped++;
        continue;
      }

      // Determine outcome
      let outcome = 'PENDING';
      if (p.state === 'CLAIMED') outcome = 'WIN';
      else if (p.state === 'FAILED') outcome = 'LOSS';
      else if (p.state === 'SETTLED') outcome = 'SETTLED';
      else if (p.state === 'OPEN') outcome = 'OPEN';

      // Insert prediction
      const result = insertPred.run(
        p.createdAt,
        p.market,
        p.oracleId,
        p.direction,
        parseInt(p.strike || '0'),
        0, // confidence unknown for historical
        p.digest,
        p.state.toLowerCase()
      );

      const predId = Number(result.lastInsertRowid);

      // Insert settlement if claimed/failed
      if (p.state === 'CLAIMED' || p.state === 'FAILED') {
        const pnl = p.rewardAmount ? parseInt(p.rewardAmount) : null;
        insertSettlement.run(
          predId,
          p.oracleId,
          null, // settlement_price unknown
          parseInt(p.strike || '0'),
          p.direction,
          outcome,
          pnl,
          p.claimedAt || p.settledAt || null
        );
      }

      imported++;
    }
  });

  tx();

  console.log(`[Import] Imported: ${imported}, Skipped (duplicates): ${skipped}`);

  // Summary stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) as claimed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
      market,
      direction
    FROM predictions
    GROUP BY market, direction
    ORDER BY total DESC
  `).all();

  console.log('\n[Import] Summary by market+direction:');
  for (const s of stats as any[]) {
    console.log(`  ${s.market}/${s.direction}: ${s.total} total, ${s.claimed} claimed, ${s.failed} failed, ${s.open} open`);
  }

  closeDb();
}

importPositions();

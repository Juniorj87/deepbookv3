import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, 'research.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      market TEXT NOT NULL,
      oracle_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      strike INTEGER NOT NULL,
      confidence REAL NOT NULL,
      rsi REAL,
      ema REAL,
      momentum REAL,
      funding REAL,
      volatility REAL,
      btc_correlation REAL,
      score INTEGER,
      explanation TEXT,
      tx_digest TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER REFERENCES predictions(id),
      oracle_id TEXT NOT NULL,
      settlement_price INTEGER,
      strike INTEGER NOT NULL,
      direction TEXT NOT NULL,
      outcome TEXT,
      pnl INTEGER,
      settled_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oracle_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      oracle_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      on_chain_price INTEGER,
      external_price REAL,
      deviation_pct REAL,
      latency_ms INTEGER,
      spot_age_ms INTEGER,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      metric_name TEXT NOT NULL,
      value REAL NOT NULL,
      tags TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_market ON predictions(market);
    CREATE INDEX IF NOT EXISTS idx_predictions_timestamp ON predictions(timestamp);
    CREATE INDEX IF NOT EXISTS idx_settlements_oracle ON settlements(oracle_id);
    CREATE INDEX IF NOT EXISTS idx_oracle_snapshots_asset ON oracle_snapshots(asset);
    CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type, metric_name);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

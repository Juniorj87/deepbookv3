import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

export interface MarketConfig {
  asset: string;
  oracleEnvKey: string;
  quoteAssetEnvKey: string;
  minStrikeEnvKey: string;
  tickSizeEnvKey: string;
  defaults: { minStrike: string; tickSize: string };
  enabled: boolean;
}

export interface PredictConfig {
  version: string;
  markets: MarketConfig[];
  trading: {
    cycleIntervalMs: number;
    maxPositionFraction: number;
    kellyFraction: number;
    confidenceThreshold: number;
    claimRetryLimit: number;
    oracleRotationBufferMinutes: number;
  };
  signal: any;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "markets.json");

let _cachedConfig: PredictConfig | null = null;

export function loadConfig(): PredictConfig {
  if (_cachedConfig) return _cachedConfig;
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  _cachedConfig = JSON.parse(raw) as PredictConfig;
  return _cachedConfig;
}

export function resolveMarkets(config: PredictConfig) {
  return config.markets
    .filter((m) => m.enabled)
    .map((m) => {
      const oracleId = process.env[m.oracleEnvKey] || "";
      const minStrike = BigInt(process.env[m.minStrikeEnvKey] || m.defaults.minStrike);
      const tickSize = BigInt(process.env[m.tickSizeEnvKey] || m.defaults.tickSize);
      if (!oracleId) return null;
      return { asset: m.asset, oracleId, minStrike, tickSize };
    })
    .filter(Boolean) as Array<{
    asset: string;
    oracleId: string;
    minStrike: bigint;
    tickSize: bigint;
  }>;
}

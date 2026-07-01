/**
 * Oracle Audit Service — сравнивает on-chain цены оракулов с Binance/Bybit.
 * Запускается как отдельный PM2 процесс. Каждые N минут: fetch on-chain → fetch external → compare → log.
 * Uses direct RPC calls instead of SDK to avoid module resolution issues.
 */

import { logOracleSnapshot } from './oracle-auditor';
import { getDb } from './db';

const SUI_RPC = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

const ASSETS: Record<string, { oracleId: string; binanceSymbol: string; bybitSymbol: string }> = {};

function loadConfig() {
  const btcOracle = process.env.BTC_ORACLE_ID;
  const ethOracle = process.env.ETH_ORACLE_ID;
  const deepOracle = process.env.DEEP_ORACLE_ID;

  if (btcOracle) ASSETS['BTC'] = { oracleId: btcOracle, binanceSymbol: 'BTCUSDT', bybitSymbol: 'BTCUSDT' };
  if (ethOracle) ASSETS['ETH'] = { oracleId: ethOracle, binanceSymbol: 'ETHUSDT', bybitSymbol: 'ETHUSDT' };
  if (deepOracle) ASSETS['DEEP'] = { oracleId: deepOracle, binanceSymbol: 'DEEPUSDT', bybitSymbol: 'DEEPUSDT' };

  console.log(`[OracleAudit] Loaded ${Object.keys(ASSETS).length} assets`);
}

async function fetchExternalPrice(symbol: string): Promise<{ price: number; latencyMs: number } | null> {
  const start = Date.now();
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const data = await res.json() as any;
    return { price: parseFloat(data.price), latencyMs: Date.now() - start };
  } catch {
    try {
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
      const data = await res.json() as any;
      const item = data?.result?.list?.[0];
      if (item) return { price: parseFloat(item.lastPrice), latencyMs: Date.now() - start };
    } catch {}
  }
  return null;
}

async function fetchOnChainPrice(oracleId: string): Promise<{ spotPrice: number; spotTimestamp: number; expiry: number; status: string } | null> {
  try {
    const res = await fetch(SUI_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getObject',
        params: [oracleId, { showContent: true }],
      }),
    });
    const json = await res.json() as any;
    if (!json.result?.data?.content?.fields) return null;

    const fields = json.result.data.content.fields;
    const spotRaw = BigInt(fields.spot || '0');
    const spotPrice = Number(spotRaw) / 1e9;
    const spotTimestamp = Number(fields.spot_timestamp_ms || '0');
    const expiry = Number(fields.expiry || '0');
    const settlementPrice = fields.settlement_price;

    let status = 'ACTIVE';
    if (settlementPrice && settlementPrice !== '0' && settlementPrice !== '') status = 'SETTLED';
    else if (Date.now() > expiry) status = 'EXPIRED';

    return { spotPrice, spotTimestamp, expiry, status };
  } catch (e: any) {
    console.error(`[OracleAudit] Failed to fetch oracle ${oracleId}:`, e.message);
    return null;
  }
}

async function auditOracle(asset: string, config: typeof ASSETS[string]) {
  const [external, onChain] = await Promise.all([
    fetchExternalPrice(config.binanceSymbol),
    fetchOnChainPrice(config.oracleId),
  ]);

  if (!external || !onChain) {
    console.log(`[OracleAudit] ${asset}: SKIP (external=${!!external}, onChain=${!!onChain})`);
    return;
  }

  const spotAgeMs = onChain.spotTimestamp > 0 ? Date.now() - onChain.spotTimestamp : 999999;
  const deviationPct = onChain.spotPrice > 0
    ? ((external.price - onChain.spotPrice) / onChain.spotPrice) * 100
    : 0;

  logOracleSnapshot({
    oracleId: config.oracleId,
    asset,
    onChainPrice: onChain.spotPrice,
    externalPrice: external.price,
    latencyMs: external.latencyMs,
    spotAgeMs,
    status: onChain.status,
  });

  const devFlag = Math.abs(deviationPct) > 1 ? ' ⚠️' : '';
  console.log(`[OracleAudit] ${asset}: onChain=${onChain.spotPrice.toFixed(2)} external=${external.price.toFixed(2)} dev=${deviationPct.toFixed(4)}% age=${(spotAgeMs / 1000).toFixed(0)}s status=${onChain.status}${devFlag}`);
}

async function runAuditCycle() {
  for (const [asset, config] of Object.entries(ASSETS)) {
    await auditOracle(asset, config);
  }
}

async function main() {
  console.log('[OracleAudit] Starting Oracle Audit Service...');
  loadConfig();
  getDb();

  const intervalMs = parseInt(process.env.ORACLE_AUDIT_INTERVAL_MS || '60000');
  console.log(`[OracleAudit] Audit interval: ${intervalMs}ms`);

  await runAuditCycle();

  setInterval(async () => {
    try {
      await runAuditCycle();
    } catch (e: any) {
      console.error('[OracleAudit] Cycle error:', e.message);
    }
  }, intervalMs);
}

main();

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, MOCK } from '../api';

interface Balances {
  wallet: { deep: number; usdc: number; sui: number };
  staked: { deep: number; positions: number; usd: number };
  earned: { deep: number; positions: number; usd: number };
  pending: { deep: number; positions: number; usd: number };
  total: { deep: number; usd: number };
  deepPrice: number;
}

interface LiveMetrics {
  collectedAt: string;
  positions: {
    total: number; open: number; claimed: number; failed: number;
    winners: number; winRate: string; totalPnl: number; avgAgeHours: string;
    byMarket: Record<string, { total: number; open: number; claimed: number; winners: number }>;
  };
  session: {
    last24h: { total: number; claimed: number; failed: number };
    last1h: { total: number; claimed: number; failed: number };
  };
  velocity: { tradesPerHour: string; avgTimeBetweenTrades: string };
  balances: Balances;
  dashboard: { cycle: number; lastUpdate: string; oracle: { id: string; expiry: number } | null };
  signals: Record<string, { direction: string; score: number; confidence: number; rsi: number; session: string }>;
}

interface HealthStatus {
  status: string; uptime: number; uptimeHuman: string;
  dbStats: { predictions: number; snapshots: number; metrics: number };
  memoryMB: number;
}

export default function Dashboard() {
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    const [liveRes, healthRes] = await Promise.all([
      apiFetch<LiveMetrics>('/api/live', MOCK.live),
      apiFetch<HealthStatus>('/api/health', MOCK.health),
    ]);
    setLive(liveRes);
    setHealth(healthRes);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!live || !health) return <div className="page-title">Loading...</div>;

  const { positions, session, velocity, signals, balances } = live;
  const oracleExpiry = live.dashboard.oracle?.expiry ?? 0;
  const oracleRemaining = Math.max(0, (oracleExpiry - Date.now()) / 3600000);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Auto-refresh 30s | Last: {lastRefresh.toLocaleTimeString()}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Account Balances</div>
        <div className="grid grid-4">
          <BalanceCard label="Wallet" deep={balances.wallet.deep} usdc={balances.wallet.usdc} sui={balances.wallet.sui} icon="Wallet" />
          <BalanceCard label="Staked (Open)" deep={balances.staked.deep} positions={balances.staked.positions} usd={balances.staked.usd} icon="📈" color="var(--blue)" />
          <BalanceCard label="Earned (Claimed)" deep={balances.earned.deep} positions={balances.earned.positions} usd={balances.earned.usd} icon="✅" color="var(--green)" />
          <BalanceCard label="Pending (Settled)" deep={balances.pending.deep} positions={balances.pending.positions} usd={balances.pending.usd} icon="⏳" color="var(--yellow)" />
        </div>
        <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--bg-primary)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Total Portfolio Value</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)' }}>${balances.total.usd.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Total DEEP</span>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{balances.total.deep.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>DEEP @ ${balances.deepPrice}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-4">
        <Card title="Total Positions" value={positions.total} sub={`${positions.open} open | ${positions.claimed} claimed`} />
        <Card title="Win Rate" value={positions.winRate + '%'} sub={`${positions.winners}W / ${positions.failed}L`} color="var(--green)" />
        <Card title="Trades / Hour" value={velocity.tradesPerHour} sub={`${velocity.avgTimeBetweenTrades} min between`} color="var(--blue)" />
        <Card title="Oracle" value={oracleRemaining.toFixed(1) + 'h'} sub={`Cycle #${live.dashboard.cycle}`} color={oracleRemaining < 1 ? 'var(--red)' : 'var(--yellow)'} />
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <Card title="Last 24h" value={session.last24h.total} sub={`${session.last24h.claimed} claimed | ${session.last24h.failed} failed`} />
        <Card title="Last 1h" value={session.last1h.total} sub={`${session.last1h.claimed} claimed | ${session.last1h.failed} failed`} />
        <Card title="Total Rewards" value={positions.totalPnl > 0 ? (positions.totalPnl / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'} sub={`${positions.claimed} claimed positions`} color="var(--green)" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Positions by Market</div>
          <table>
            <thead><tr><th>Market</th><th>Total</th><th>Open</th><th>Claimed</th></tr></thead>
            <tbody>
              {Object.entries(positions.byMarket).map(([market, stats]) => (
                <tr key={market}>
                  <td style={{ fontWeight: 600 }}>{market}</td>
                  <td>{stats.total}</td>
                  <td>{stats.open}</td>
                  <td style={{ color: 'var(--green)' }}>{stats.claimed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">Active Signals</div>
          <table>
            <thead><tr><th>Asset</th><th>Dir</th><th>Score</th><th>Conf</th><th>RSI</th><th>Session</th></tr></thead>
            <tbody>
              {Object.entries(signals).map(([asset, sig]) => (
                <tr key={asset}>
                  <td style={{ fontWeight: 600 }}>{asset}</td>
                  <td><span className={`badge badge-${sig.direction.toLowerCase()}`}>{sig.direction}</span></td>
                  <td>{sig.score}</td>
                  <td>{sig.confidence}%</td>
                  <td>{sig.rsi?.toFixed(1)}</td>
                  <td>{sig.session}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">System Health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
          <div><div className="stat-label">API Uptime</div><div style={{ fontWeight: 600 }}>{health.uptimeHuman}</div></div>
          <div><div className="stat-label">Memory</div><div style={{ fontWeight: 600 }}>{health.memoryMB}MB</div></div>
          <div><div className="stat-label">Predictions</div><div style={{ fontWeight: 600 }}>{health.dbStats.predictions}</div></div>
          <div><div className="stat-label">Oracle Snapshots</div><div style={{ fontWeight: 600 }}>{health.dbStats.snapshots}</div></div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub, color }: { title: string; value: string | number; sub: string; color?: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-label">{sub}</div>
    </div>
  );
}

function BalanceCard({ label, deep, usdc, sui, positions, usd, icon, color }: {
  label: string; deep: number; usdc?: number; sui?: number; positions?: number; usd?: number; icon: string; color?: string;
}) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>
        {deep.toLocaleString(undefined, { maximumFractionDigits: 0 })} DEEP
      </div>
      {usdc !== undefined && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{usdc} USDC</div>}
      {sui !== undefined && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sui} SUI</div>}
      {positions !== undefined && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{positions} positions</div>}
      {usd !== undefined && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>~${usd.toLocaleString()}</div>}
    </div>
  );
}

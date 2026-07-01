import { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface LiveMetrics {
  collectedAt: string;
  positions: {
    total: number;
    open: number;
    claimed: number;
    failed: number;
    winners: number;
    winRate: string;
    totalPnl: number;
    avgAgeHours: string;
    byMarket: Record<string, { total: number; open: number; claimed: number; winners: number }>;
  };
  session: {
    last24h: { total: number; claimed: number; failed: number };
    last1h: { total: number; claimed: number; failed: number };
  };
  velocity: { tradesPerHour: string; avgTimeBetweenTrades: string };
  dashboard: {
    cycle: number;
    lastUpdate: string;
    balances: Record<string, number | string>;
    oracle: { id: string; expiry: number } | null;
  };
  signals: Record<string, { direction: string; score: number; confidence: number; rsi: number; momentum: number; fundingRate: number; session: string }>;
}

interface HealthStatus {
  status: string;
  uptime: number;
  uptimeHuman: string;
  dbStats: { predictions: number; snapshots: number; metrics: number };
  memoryMB: number;
}

const COLORS = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#74b9ff'];

export default function Dashboard() {
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [liveRes, healthRes] = await Promise.all([
        fetch('/api/live').then(r => r.json()),
        fetch('/api/health').then(r => r.json()),
      ]);
      setLive(liveRes);
      setHealth(healthRes);
      setLastRefresh(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!live || !health) return <div className="page-title">Loading...</div>;

  const { positions, session, velocity, signals } = live;
  const oracleExpiry = live.dashboard.oracle?.expiry ?? 0;
  const oracleRemaining = Math.max(0, (oracleExpiry - Date.now()) / 3600000);

  const marketPie = Object.entries(positions.byMarket).map(([name, v]) => ({
    name,
    value: v.claimed,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Dashboard</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Auto-refresh 30s | Last: {lastRefresh.toLocaleTimeString()} | DB: {health.dbStats.predictions} preds, {health.dbStats.snapshots} snaps
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-4">
        <Card
          title="Total Positions"
          value={positions.total}
          sub={`${positions.open} open | ${positions.claimed} claimed`}
          color="var(--accent-light)"
        />
        <Card
          title="Win Rate"
          value={positions.winRate + '%'}
          sub={`${positions.winners}W / ${positions.failed}L`}
          color="var(--green)"
        />
        <Card
          title="Trades / Hour"
          value={velocity.tradesPerHour}
          sub={`${velocity.avgTimeBetweenTrades} min between`}
          color="var(--blue)"
        />
        <Card
          title="Oracle Remaining"
          value={oracleRemaining.toFixed(1) + 'h'}
          sub={`Cycle #${live.dashboard.cycle}`}
          color={oracleRemaining < 1 ? 'var(--red)' : 'var(--yellow)'}
        />
      </div>

      {/* Session stats */}
      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <Card
          title="Last 24h"
          value={session.last24h.total}
          sub={`${session.last24h.claimed} claimed | ${session.last24h.failed} failed`}
        />
        <Card
          title="Last 1h"
          value={session.last1h.total}
          sub={`${session.last1h.claimed} claimed | ${session.last1h.failed} failed`}
        />
        <Card
          title="Total Rewards (DEEP)"
          value={(positions.totalPnl / 1e6).toFixed(2) + 'M'}
          sub={`${positions.claimed} claimed positions`}
          color="var(--green)"
        />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {/* Market breakdown */}
        <div className="card">
          <div className="card-title">Positions by Market</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {marketPie.length > 0 && (
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={marketPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50}>
                    {marketPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div style={{ flex: 1 }}>
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
          </div>
        </div>

        {/* Active signals */}
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

      {/* System health */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">System Health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
          <div>
            <div className="stat-label">API Uptime</div>
            <div style={{ fontWeight: 600 }}>{health.uptimeHuman}</div>
          </div>
          <div>
            <div className="stat-label">Memory</div>
            <div style={{ fontWeight: 600 }}>{health.memoryMB}MB</div>
          </div>
          <div>
            <div className="stat-label">Oracle Snapshots</div>
            <div style={{ fontWeight: 600 }}>{health.dbStats.snapshots}</div>
          </div>
          <div>
            <div className="stat-label">Metrics Points</div>
            <div style={{ fontWeight: 600 }}>{health.dbStats.metrics}</div>
          </div>
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

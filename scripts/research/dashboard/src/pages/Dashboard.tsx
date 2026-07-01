import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface Stats {
  summary: {
    predictions: { total: number; confirmed: number; failed: number; avgConfidence: number };
    settlements: { total: number; wins: number; losses: number; winRate: string; totalPnl: number };
    oracle: { checks: number; avgLatencyMs: number; avgDeviationPct: number; maxDeviationPct: number };
  };
  predictions: Array<{ market: string; direction: string; total: number }>;
}

interface HourlyPoint {
  hour: string;
  predictions: number;
  avg_confidence: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats);
    fetch('/api/metrics/hourly?hours=24').then(r => r.json()).then(setHourly);
  }, []);

  if (!stats) return <div className="page-title">Loading...</div>;

  const { summary } = stats;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="grid grid-4">
        <Card title="Predictions (24h)" value={summary.predictions.total} sub={`${summary.predictions.confirmed} confirmed`} />
        <Card title="Win Rate" value={summary.settlements.winRate} sub={`${summary.settlements.wins}W / ${summary.settlements.losses}L`} />
        <Card title="Avg Confidence" value={(summary.predictions.avgConfidence * 100).toFixed(1) + '%'} sub="across all markets" />
        <Card title="Oracle Latency" value={summary.oracle.avgLatencyMs.toFixed(0) + 'ms'} sub={`dev: ${summary.oracle.avgDeviationPct.toFixed(2)}%`} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Predictions by Market</div>
          <table>
            <thead>
              <tr><th>Market</th><th>Direction</th><th>Count</th></tr>
            </thead>
            <tbody>
              {stats.predictions.map((p, i) => (
                <tr key={i}>
                  <td>{p.market}</td>
                  <td><span className={`badge badge-${p.direction.toLowerCase()}`}>{p.direction}</span></td>
                  <td>{p.total}</td>
                </tr>
              ))}
              {stats.predictions.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Hourly Predictions</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourly}>
              <defs>
                <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6c5ce7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6c5ce7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v: string) => v.slice(11, 16)} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }} />
              <Area type="monotone" dataKey="predictions" stroke="#6c5ce7" fill="url(#colorPred)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string | number; sub: string }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{sub}</div>
    </div>
  );
}

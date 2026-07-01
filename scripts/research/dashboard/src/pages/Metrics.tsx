import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface MetricsData {
  generatedAt: string;
  summary: {
    predictions: { total: number; confirmed: number; failed: number; avgConfidence: number };
    settlements: { total: number; wins: number; losses: number; winRate: string; totalPnl: number };
    oracle: { checks: number; avgLatencyMs: number; avgDeviationPct: number; maxDeviationPct: number };
  };
  hourly: Array<{ hour: string; predictions: number; avg_confidence: number }>;
}

const COLORS = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#74b9ff'];

export default function Metrics() {
  const [data, setData] = useState<MetricsData | null>(null);

  useEffect(() => {
    fetch('/api/metrics/export').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div className="page-title">Loading...</div>;

  const { summary, hourly } = data;
  const outcomePie = [
    { name: 'Wins', value: summary.settlements.wins },
    { name: 'Losses', value: summary.settlements.losses },
  ].filter(d => d.value > 0);

  const statusPie = [
    { name: 'Confirmed', value: summary.predictions.confirmed },
    { name: 'Failed', value: summary.predictions.failed },
    { name: 'Pending', value: summary.predictions.total - summary.predictions.confirmed - summary.predictions.failed },
  ].filter(d => d.value > 0);

  return (
    <div>
      <h1 className="page-title">Metrics</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Generated: {new Date(data.generatedAt).toLocaleString()}
      </p>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">Settlement Outcomes</div>
          {outcomePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={outcomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {outcomePie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No settlements</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Prediction Status</div>
          {statusPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Hourly Predictions</div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={hourly}>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#888' }} tickFormatter={(v: string) => v.slice(11, 16)} />
            <YAxis tick={{ fontSize: 11, fill: '#888' }} />
            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }} />
            <Bar dataKey="predictions" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Oracle Health</div>
          <div className="stat-value">{summary.oracle.checks}</div>
          <div className="stat-label">total checks</div>
          <div style={{ marginTop: 12 }}>
            <div className="stat-label">avg latency</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.oracle.avgLatencyMs.toFixed(0)}ms</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="stat-label">avg deviation</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.oracle.avgDeviationPct.toFixed(3)}%</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">PnL Summary</div>
          <div className="stat-value" style={{ color: (summary.settlements.totalPnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {(summary.settlements.totalPnl ?? 0).toLocaleString()}
          </div>
          <div className="stat-label">DEEP</div>
          <div style={{ marginTop: 12 }}>
            <div className="stat-label">win rate</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.settlements.winRate}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Confidence</div>
          <div className="stat-value">{(summary.predictions.avgConfidence * 100).toFixed(1)}%</div>
          <div className="stat-label">average confidence</div>
          <div style={{ marginTop: 12 }}>
            <div className="stat-label">total predictions</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{summary.predictions.total}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

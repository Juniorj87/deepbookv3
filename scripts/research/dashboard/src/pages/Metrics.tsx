import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

interface LiveMetrics {
  positions: {
    total: number;
    open: number;
    claimed: number;
    failed: number;
    winners: number;
    winRate: string;
    totalPnl: number;
    byMarket: Record<string, { total: number; open: number; claimed: number; winners: number; losers: number }>;
  };
  velocity: { tradesPerHour: string; avgTimeBetweenTrades: string };
  session: {
    last24h: { total: number; claimed: number; failed: number };
    last1h: { total: number; claimed: number; failed: number };
  };
}

interface WinRatePoint {
  hour: string;
  market: string;
  total: number;
  wins: number;
}

const COLORS = ['#6c5ce7', '#00b894', '#e17055', '#fdcb6e', '#74b9ff'];

export default function Metrics() {
  const [live, setLive] = useState<LiveMetrics | null>(null);
  const [timeline, setTimeline] = useState<WinRatePoint[]>([]);
  const [timelineHours, setTimelineHours] = useState(168);

  const fetchData = useCallback(async () => {
    const [liveRes, tlRes] = await Promise.all([
      fetch('/api/live').then(r => r.json()),
      fetch(`/api/wincrate/timeline?hours=${timelineHours}`).then(r => r.json()),
    ]);
    setLive(liveRes);
    setTimeline(tlRes);
  }, [timelineHours]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!live) return <div className="page-title">Loading...</div>;

  const { positions, velocity, session } = live;

  const outcomePie = [
    { name: 'Winners', value: positions.winners },
    { name: 'Failed', value: positions.failed },
  ].filter(d => d.value > 0);

  // Process timeline for chart
  const hours = [...new Set(timeline.map(t => t.hour))].sort();
  const markets = [...new Set(timeline.map(t => t.market))];
  const chartData = hours.map(h => {
    const point: Record<string, any> = { hour: h.slice(11, 16) };
    for (const m of markets) {
      const entry = timeline.find(t => t.hour === h && t.market === m);
      if (entry) {
        point[`${m}_rate`] = entry.total > 0 ? Math.round((entry.wins / entry.total) * 100) : 0;
        point[`${m}_count`] = entry.total;
      }
    }
    return point;
  });

  return (
    <div>
      <h1 className="page-title">Metrics</h1>

      {/* Overview cards */}
      <div className="grid grid-4">
        <div className="card">
          <div className="card-title">Win Rate</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{positions.winRate}%</div>
          <div className="stat-label">{positions.winners}W / {positions.failed}L</div>
        </div>
        <div className="card">
          <div className="card-title">Total Rewards</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {(positions.totalPnl / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })} DEEP
          </div>
          <div className="stat-label">{positions.claimed} claimed positions</div>
        </div>
        <div className="card">
          <div className="card-title">Velocity</div>
          <div className="stat-value">{velocity.tradesPerHour}</div>
          <div className="stat-label">trades/hour</div>
        </div>
        <div className="card">
          <div className="card-title">Session (24h)</div>
          <div className="stat-value">{session.last24h.total}</div>
          <div className="stat-label">{session.last24h.claimed} claimed | {session.last24h.failed} failed</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        {/* Win rate by market */}
        <div className="card">
          <div className="card-title">Outcomes</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {outcomePie.length > 0 && (
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={outcomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50}>
                    {outcomePie.map((_, i) => <Cell key={i} fill={i === 0 ? '#00b894' : '#e17055'} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div style={{ flex: 1 }}>
              <table>
                <thead><tr><th>Market</th><th>Total</th><th>Winners</th><th>Win%</th></tr></thead>
                <tbody>
                  {Object.entries(positions.byMarket).map(([market, stats]) => (
                    <tr key={market}>
                      <td style={{ fontWeight: 600 }}>{market}</td>
                      <td>{stats.total}</td>
                      <td style={{ color: 'var(--green)' }}>{stats.winners}</td>
                      <td>{stats.total > 0 ? ((stats.winners / stats.total) * 100).toFixed(1) : '0'}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Win rate by market - bar */}
        <div className="card">
          <div className="card-title">Positions by Market</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={Object.entries(positions.byMarket).map(([market, stats]) => ({
              market,
              total: stats.total,
              winners: stats.winners,
              open: stats.open,
            }))}>
              <XAxis dataKey="market" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }} />
              <Bar dataKey="winners" fill="#00b894" radius={[4, 4, 0, 0]} name="Winners" />
              <Bar dataKey="open" fill="#6c5ce7" radius={[4, 4, 0, 0]} name="Open" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Win rate timeline */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Win Rate Timeline</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[24, 72, 168].map(h => (
              <button
                key={h}
                onClick={() => setTimelineHours(h)}
                style={{
                  padding: '3px 8px',
                  background: timelineHours === h ? 'var(--accent)' : 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {h === 24 ? '1d' : h === 72 ? '3d' : '7d'}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }} />
              <Legend />
              {markets.map((m, i) => (
                <Line key={m} type="monotone" dataKey={`${m}_rate`} stroke={COLORS[i % COLORS.length]} dot={false} name={`${m} %`} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No timeline data</div>
        )}
      </div>
    </div>
  );
}

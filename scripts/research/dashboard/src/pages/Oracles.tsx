import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { apiFetch, MOCK } from '../api';

interface OracleReport {
  oracle_id: string;
  asset: string;
  samples: number;
  avg_deviation: number;
  max_deviation: number;
  avg_latency: number;
  avg_spot_age: number;
}

interface DeviationPoint {
  timestamp: string;
  on_chain_price: number;
  external_price: number;
  deviation_pct: number;
  latency_ms: number;
}

export default function Oracles() {
  const [report, setReport] = useState<OracleReport[]>([]);
  const [selectedOracle, setSelectedOracle] = useState<string | null>(null);
  const [history, setHistory] = useState<DeviationPoint[]>([]);
  const [hours, setHours] = useState(24);

  const fetchData = useCallback(async () => {
    const data = await apiFetch<OracleReport[]>(`/api/oracles?hours=${hours}`, MOCK.oracles);
    setReport(data);
  }, [hours]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (selectedOracle) {
      apiFetch<DeviationPoint[]>(`/api/oracles/${selectedOracle}/history?limit=200`, MOCK.deviationHistory)
        .then(setHistory);
    }
  }, [selectedOracle]);

  const formatAge = (ms: number) => {
    if (ms > 3600000) return (ms / 3600000).toFixed(1) + 'h';
    if (ms > 60000) return (ms / 60000).toFixed(0) + 'm';
    return (ms / 1000).toFixed(0) + 's';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Oracle Audit</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Period:</span>
          {[1, 6, 24, 72].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '4px 10px',
                background: hours === h ? 'var(--accent)' : 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Oracle Deviation Report ({hours}h)</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Oracle</th>
                <th>Asset</th>
                <th>Samples</th>
                <th>Avg Deviation</th>
                <th>Max Deviation</th>
                <th>Avg Latency</th>
                <th>Avg Spot Age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.map(o => (
                <tr
                  key={o.oracle_id}
                  style={{ cursor: 'pointer', background: selectedOracle === o.oracle_id ? 'var(--bg-hover)' : undefined }}
                  onClick={() => setSelectedOracle(selectedOracle === o.oracle_id ? null : o.oracle_id)}
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.oracle_id.slice(0, 16)}...</td>
                  <td style={{ fontWeight: 600 }}>{o.asset}</td>
                  <td>{o.samples}</td>
                  <td style={{ color: Math.abs(o.avg_deviation) > 1 ? 'var(--red)' : Math.abs(o.avg_deviation) > 0.1 ? 'var(--yellow)' : 'var(--green)' }}>
                    {o.avg_deviation.toFixed(4)}%
                  </td>
                  <td style={{ color: Math.abs(o.max_deviation) > 2 ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {o.max_deviation.toFixed(4)}%
                  </td>
                  <td>{o.avg_latency.toFixed(0)}ms</td>
                  <td>{formatAge(o.avg_spot_age)}</td>
                  <td><span style={{ color: 'var(--accent-light)', fontSize: 11 }}>{selectedOracle === o.oracle_id ? '▲' : '▼'}</span></td>
                </tr>
              ))}
              {report.length === 0 && (
                <tr><td colSpan={8} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No oracle data collected yet
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOracle && history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            Deviation History — {report.find(r => r.oracle_id === selectedOracle)?.asset} ({selectedOracle.slice(0, 12)}...)
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={history}>
              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 10, fill: '#888' }}
                tickFormatter={(v: string) => new Date(v).toLocaleTimeString()}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }}
                formatter={(val: number, name: string) => {
                  if (name === 'deviation_pct') return [val.toFixed(4) + '%', 'Deviation'];
                  if (name === 'latency_ms') return [val.toFixed(0) + 'ms', 'Latency'];
                  return [val, name];
                }}
                labelFormatter={(v: string) => new Date(v).toLocaleString()}
              />
              <ReferenceLine y={0} stroke="#555" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="deviation_pct" stroke="#6c5ce7" dot={false} name="deviation_pct" />
            </LineChart>
          </ResponsiveContainer>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16, fontSize: 13 }}>
            <div>
              <div className="stat-label">Samples</div>
              <div style={{ fontWeight: 600 }}>{history.length}</div>
            </div>
            <div>
              <div className="stat-label">Max Deviation</div>
              <div style={{ fontWeight: 600, color: Math.abs(Math.max(...history.map(h => Math.abs(h.deviation_pct)))) > 1 ? 'var(--red)' : 'var(--green)' }}>
                {Math.max(...history.map(h => Math.abs(h.deviation_pct))).toFixed(4)}%
              </div>
            </div>
            <div>
              <div className="stat-label">Avg Latency</div>
              <div style={{ fontWeight: 600 }}>{(history.reduce((a, h) => a + h.latency_ms, 0) / history.length).toFixed(0)}ms</div>
            </div>
            <div>
              <div className="stat-label">Price Range</div>
              <div style={{ fontWeight: 600 }}>
                {Math.min(...history.map(h => h.external_price)).toFixed(2)} — {Math.max(...history.map(h => h.external_price)).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

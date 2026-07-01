import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

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

  useEffect(() => {
    fetch('/api/oracles?hours=24').then(r => r.json()).then(setReport);
  }, []);

  useEffect(() => {
    if (selectedOracle) {
      fetch(`/api/oracles/${selectedOracle}/history?limit=100`)
        .then(r => r.json())
        .then(setHistory);
    }
  }, [selectedOracle]);

  return (
    <div>
      <h1 className="page-title">Oracle Audit</h1>

      <div className="card">
        <div className="card-title">Oracle Deviation Report (24h)</div>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {report.map(o => (
                <tr key={o.oracle_id} style={{ cursor: 'pointer' }} onClick={() => setSelectedOracle(o.oracle_id)}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.oracle_id.slice(0, 12)}...</td>
                  <td>{o.asset}</td>
                  <td>{o.samples}</td>
                  <td style={{ color: Math.abs(o.avg_deviation) > 1 ? 'var(--red)' : 'var(--green)' }}>
                    {o.avg_deviation.toFixed(3)}%
                  </td>
                  <td style={{ color: Math.abs(o.max_deviation) > 2 ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {o.max_deviation.toFixed(3)}%
                  </td>
                  <td>{o.avg_latency.toFixed(0)}ms</td>
                  <td><span style={{ color: 'var(--accent-light)', fontSize: 12 }}>details →</span></td>
                </tr>
              ))}
              {report.length === 0 && (
                <tr><td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No oracle data collected yet. Start the oracle auditor to begin monitoring.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOracle && history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            Deviation History — {selectedOracle.slice(0, 12)}...
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={history}>
              <XAxis
                dataKey="timestamp"
                tick={{ fontSize: 10, fill: '#888' }}
                tickFormatter={(v: string) => new Date(v).toLocaleTimeString()}
              />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8 }}
                formatter={(val: number) => [val.toFixed(3) + '%', 'Deviation']}
              />
              <ReferenceLine y={0} stroke="#555" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="deviation_pct" stroke="#6c5ce7" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

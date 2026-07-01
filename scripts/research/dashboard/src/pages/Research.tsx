import { useEffect, useState } from 'react';

interface Prediction {
  id: number;
  timestamp: string;
  market: string;
  oracle_id: string;
  direction: string;
  strike: number;
  confidence: number;
  rsi: number | null;
  ema: number | null;
  momentum: number | null;
  funding: number | null;
  volatility: number | null;
  btc_correlation: number | null;
  score: number | null;
  explanation: string | null;
  tx_digest: string | null;
  status: string;
}

export default function Research() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetch(`/api/predictions?limit=${limit}`)
      .then(r => r.json())
      .then(setPredictions);
  }, [limit]);

  return (
    <div>
      <h1 className="page-title">Research — Prediction Reasoning</h1>

      <div className="card">
        <div className="card-title">Recent Predictions ({predictions.length})</div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Market</th>
                <th>Direction</th>
                <th>Strike</th>
                <th>Confidence</th>
                <th>RSI</th>
                <th>EMA</th>
                <th>Score</th>
                <th>Status</th>
                <th>TX</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.timestamp).toLocaleTimeString()}</td>
                  <td>{p.market}</td>
                  <td><span className={`badge badge-${p.direction.toLowerCase()}`}>{p.direction}</span></td>
                  <td>{p.strike}</td>
                  <td>{(p.confidence * 100).toFixed(1)}%</td>
                  <td>{p.rsi?.toFixed(1) ?? '-'}</td>
                  <td>{p.ema?.toFixed(4) ?? '-'}</td>
                  <td>{p.score ?? '-'}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>{p.tx_digest ? <a href={`https://suiscan.xyz/testnet/tx/${p.tx_digest}`} target="_blank" rel="noreferrer">{p.tx_digest.slice(0, 8)}...</a> : '-'}</td>
                </tr>
              ))}
              {predictions.length === 0 && (
                <tr><td colSpan={10} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No predictions logged yet. Start the research agent to begin collecting data.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {[25, 50, 100, 200].map(n => (
          <button
            key={n}
            onClick={() => setLimit(n)}
            style={{
              padding: '6px 14px',
              background: limit === n ? 'var(--accent)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

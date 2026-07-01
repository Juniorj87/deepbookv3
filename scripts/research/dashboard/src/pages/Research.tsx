import { useEffect, useState, useCallback } from 'react';

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
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/predictions?limit=${limit}`);
    const data = await res.json();
    setPredictions(data);
  }, [limit]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filtered = filter === 'all' ? predictions
    : predictions.filter(p => p.status === filter);

  const statusCounts = predictions.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <h1 className="page-title">Research — Prediction Reasoning</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'claimed', 'open', 'settled', 'failed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              background: filter === s ? 'var(--accent)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {s} {s !== 'all' && statusCounts[s] ? `(${statusCounts[s]})` : ''}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {filtered.length} results | auto-refresh 15s
        </span>
      </div>

      <div className="card">
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
                <th>Score</th>
                <th>Reasoning</th>
                <th>Status</th>
                <th>TX</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.timestamp).toLocaleTimeString()}</td>
                  <td style={{ fontWeight: 600 }}>{p.market}</td>
                  <td><span className={`badge badge-${p.direction.toLowerCase()}`}>{p.direction}</span></td>
                  <td>{p.strike > 0 ? p.strike.toLocaleString() : '-'}</td>
                  <td>{p.confidence > 0 ? (p.confidence * 100).toFixed(1) + '%' : '-'}</td>
                  <td>{p.rsi?.toFixed(1) ?? '-'}</td>
                  <td>{p.score ?? '-'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted)' }}>
                    {p.explanation ?? '-'}
                  </td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>
                    {p.tx_digest && p.tx_digest !== 'already-claimed-onchain'
                      ? <a href={`https://suiscan.xyz/testnet/tx/${p.tx_digest}`} target="_blank" rel="noreferrer">{p.tx_digest.slice(0, 8)}...</a>
                      : p.tx_digest === 'already-claimed-onchain' ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>on-chain</span>
                      : '-'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No predictions found
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        {[25, 50, 100, 200].map(n => (
          <button
            key={n}
            onClick={() => setLimit(n)}
            style={{
              padding: '4px 12px',
              background: limit === n ? 'var(--accent)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

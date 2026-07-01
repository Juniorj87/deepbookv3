import { useEffect, useState, useCallback } from 'react';

interface Prediction {
  id: number;
  timestamp: string;
  market: string;
  oracle_id: string;
  direction: string;
  strike: number;
  confidence: number;
  score: number | null;
  explanation: string | null;
  tx_digest: string | null;
  status: string;
}

export default function History() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selected, setSelected] = useState<Prediction | null>(null);
  const [limit, setLimit] = useState(200);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/predictions?limit=${limit}`);
    const data = await res.json();
    setPredictions(data);
  }, [limit]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const statusColor = (s: string) => {
    if (s === 'claimed' || s === 'confirmed') return 'var(--green)';
    if (s === 'failed') return 'var(--red)';
    if (s === 'settled') return 'var(--yellow)';
    return 'var(--text-muted)';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>History — Full Prediction Log</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {predictions.length} records | auto-refresh 30s
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Market</th>
                <th>Dir</th>
                <th>Strike</th>
                <th>Conf</th>
                <th>Score</th>
                <th>Status</th>
                <th>TX</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelected(selected?.id === p.id ? null : p)}
                  style={{
                    cursor: 'pointer',
                    background: selected?.id === p.id ? 'var(--bg-hover)' : undefined,
                    borderLeft: `3px solid ${statusColor(p.status)}`,
                  }}
                >
                  <td style={{ color: 'var(--text-muted)' }}>{p.id}</td>
                  <td>{new Date(p.timestamp).toLocaleString()}</td>
                  <td style={{ fontWeight: 600 }}>{p.market}</td>
                  <td><span className={`badge badge-${p.direction.toLowerCase()}`}>{p.direction}</span></td>
                  <td>{p.strike > 0 ? p.strike.toLocaleString() : '-'}</td>
                  <td>{p.confidence > 0 ? (p.confidence * 100).toFixed(1) + '%' : '-'}</td>
                  <td>{p.score ?? '-'}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>
                    {p.tx_digest && p.tx_digest !== 'already-claimed-onchain'
                      ? <a href={`https://suiscan.xyz/testnet/tx/${p.tx_digest}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                          {p.tx_digest.slice(0, 10)}...
                        </a>
                      : p.tx_digest === 'already-claimed-onchain' ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>on-chain</span>
                      : '-'}
                  </td>
                </tr>
              ))}
              {predictions.length === 0 && (
                <tr><td colSpan={9} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
                  No history yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Prediction #{selected.id} — Details</div>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}
            >
              x
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, fontSize: 13 }}>
            <div>
              <div className="stat-label">Market</div>
              <div style={{ fontWeight: 600 }}>{selected.market}</div>
            </div>
            <div>
              <div className="stat-label">Oracle ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>{selected.oracle_id}</div>
            </div>
            <div>
              <div className="stat-label">Timestamp</div>
              <div>{new Date(selected.timestamp).toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-label">Direction</div>
              <div><span className={`badge badge-${selected.direction.toLowerCase()}`}>{selected.direction}</span></div>
            </div>
            <div>
              <div className="stat-label">Strike</div>
              <div style={{ fontWeight: 600 }}>{selected.strike > 0 ? selected.strike.toLocaleString() : '-'}</div>
            </div>
            <div>
              <div className="stat-label">Confidence</div>
              <div style={{ fontWeight: 600 }}>{selected.confidence > 0 ? (selected.confidence * 100).toFixed(1) + '%' : '-'}</div>
            </div>
            <div>
              <div className="stat-label">Score</div>
              <div style={{ fontWeight: 600 }}>{selected.score ?? '-'}</div>
            </div>
            <div>
              <div className="stat-label">Status</div>
              <div><span className={`badge badge-${selected.status}`}>{selected.status}</span></div>
            </div>
          </div>
          {selected.explanation && (
            <div style={{ marginTop: 16 }}>
              <div className="stat-label">Reasoning</div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, marginTop: 4, fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace' }}>
                {selected.explanation}
              </div>
            </div>
          )}
          {selected.tx_digest && (
            <div style={{ marginTop: 12 }}>
              <a
                href={`https://suiscan.xyz/testnet/tx/${selected.tx_digest}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12 }}
              >
                View on SuiScan →
              </a>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        {[50, 100, 200, 500].map(n => (
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

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    fetch('/api/predictions?limit=200').then(r => r.json()).then(setPredictions);
  }, []);

  return (
    <div>
      <h1 className="page-title">History — Full Prediction Log</h1>

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
                  style={{ cursor: 'pointer', background: selected?.id === p.id ? 'var(--bg-hover)' : undefined }}
                >
                  <td>{p.id}</td>
                  <td>{new Date(p.timestamp).toLocaleString()}</td>
                  <td>{p.market}</td>
                  <td><span className={`badge badge-${p.direction.toLowerCase()}`}>{p.direction}</span></td>
                  <td>{p.strike}</td>
                  <td>{(p.confidence * 100).toFixed(1)}%</td>
                  <td>{p.score ?? '-'}</td>
                  <td><span className={`badge badge-${p.status}`}>{p.status}</span></td>
                  <td>
                    {p.tx_digest
                      ? <a href={`https://suiscan.xyz/testnet/tx/${p.tx_digest}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                          {p.tx_digest.slice(0, 8)}...
                        </a>
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

      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">Prediction #{selected.id} — Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 13 }}>
            <div>
              <div className="stat-label">Market</div>
              <div style={{ fontWeight: 600 }}>{selected.market}</div>
            </div>
            <div>
              <div className="stat-label">Oracle ID</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{selected.oracle_id}</div>
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
              <div style={{ fontWeight: 600 }}>{selected.strike}</div>
            </div>
            <div>
              <div className="stat-label">Confidence</div>
              <div style={{ fontWeight: 600 }}>{(selected.confidence * 100).toFixed(1)}%</div>
            </div>
          </div>
          {selected.explanation && (
            <div style={{ marginTop: 16 }}>
              <div className="stat-label">Reasoning</div>
              <div style={{ background: 'var(--bg-primary)', padding: 12, borderRadius: 8, marginTop: 4, fontSize: 13, lineHeight: 1.6 }}>
                {selected.explanation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

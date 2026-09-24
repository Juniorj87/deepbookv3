import { useEffect, useMemo, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  CLOCK_ID,
  DEEP_TYPE,
  MARKETS,
  PACKAGE_ID,
  PREDICT_ID,
  REGISTRY_ID,
  fetchSpot,
  suiscanTx,
  toHuman,
  toRaw,
} from "../config";

interface SavedTrade {
  digest: string;
  market: string;
  direction: string;
  strike: string;
  qty: string;
  time: string;
}

const loadTrades = (): SavedTrade[] => {
  try {
    return JSON.parse(localStorage.getItem("predict_trades") || "[]");
  } catch {
    return [];
  }
};

export default function Trade() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();

  const [marketIdx, setMarketIdx] = useState(0);
  const market = MARKETS[marketIdx];
  const [spot, setSpot] = useState<number | null>(null);
  const [strikeHuman, setStrikeHuman] = useState("");
  const [qtyHuman, setQtyHuman] = useState("20");
  const [isUp, setIsUp] = useState(true);
  const [oracleInfo, setOracleInfo] = useState<{
    expiry: number;
    active: boolean;
  } | null>(null);
  const [managerId, setManagerId] = useState(
    () => localStorage.getItem("predict_manager_id") || "",
  );
  const [depositHuman, setDepositHuman] = useState("100");
  const [status, setStatus] = useState("");
  const [lastDigest, setLastDigest] = useState("");
  const [trades, setTrades] = useState<SavedTrade[]>(loadTrades);

  // live spot + oracle expiry
  useEffect(() => {
    let stop = false;
    (async () => {
      const p = await fetchSpot(market);
      if (!stop) {
        setSpot(p);
        const tickHuman = market.tickSize / 1e9;
        setStrikeHuman(String(Math.round(p / tickHuman) * tickHuman));
      }
    })();
    suiClient
      .getObject({ id: market.oracleId, options: { showContent: true } })
      .then((o: unknown) => {
        const content = (o as { data?: { content?: unknown } })?.data?.content as
          | { dataType?: string; fields?: { expiry?: string; active?: boolean } }
          | undefined;
        if (content?.dataType === "moveObject" && content.fields && !stop) {
          setOracleInfo({
            expiry: Number(content.fields.expiry ?? 0),
            active: !!content.fields.active,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [market, suiClient]);

  const expiryLeft = useMemo(() => {
    if (!oracleInfo?.expiry) return "—";
    const ms = oracleInfo.expiry - Date.now();
    if (ms <= 0) return "expired";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [oracleInfo]);

  const run = async (label: string, build: (tx: Transaction) => void) => {
    if (!account) {
      setStatus("Подключи кошелек (Sui testnet).");
      return "";
    }
    setStatus(`${label}… подпиши в кошельке`);
    try {
      const tx = new Transaction();
      build(tx);
      const res = await signAndExecute({ transaction: tx });
      setLastDigest(res.digest);
      setStatus(`${label}: OK`);
      return res.digest;
    } catch (e) {
      setStatus(`${label}: ${(e as Error).message.slice(0, 200)}`);
      return "";
    }
  };

  const createManager = () =>
    run("create_manager", (tx) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::registry::create_manager`,
        arguments: [tx.object(REGISTRY_ID)],
      });
    }).then(async (digest) => {
      if (!digest) return;
      // find created manager object
      try {
        const full = await suiClient.getTransactionBlock({
          digest,
          options: { showObjectChanges: true },
        });
        const changes = (full as unknown as { objectChanges?: Array<{ type?: string; objectId?: string; objectType?: string }> }).objectChanges || [];
        const mgr = changes.find(
          (c) => c.type === "created" && (c.objectType || "").includes("Manager"),
        );
        if (mgr?.objectId) {
          setManagerId(mgr.objectId);
          localStorage.setItem("predict_manager_id", mgr.objectId);
          setStatus(`Менеджер создан: ${mgr.objectId}`);
        } else {
          setStatus("Менеджер создан, но ID не найден — открой транзакцию в Suiscan и вставь ID вручную.");
        }
      } catch {
        setStatus("Менеджер создан — вставь его ID вручную из Suiscan.");
      }
    });

  const deposit = async () => {
    const amountRaw = BigInt(toRaw(Number(depositHuman) || 0));
    if (!account) return setStatus("Подключи кошелек.");
    if (!managerId) return setStatus("Сначала создай менеджер.");
    if (amountRaw <= 0n) return setStatus("Сумма депозита > 0.");
    setStatus("deposit… ищу DEEP-монеты");
    const coins = await suiClient.getCoins({
      owner: account.address,
      coinType: DEEP_TYPE,
    });
    const pick = coins.data.find((c: { balance: string }) => BigInt(c.balance) >= amountRaw);
    if (!pick) {
      setStatus("Нет testnet DEEP на балансе. Возьми в faucet / перекинь с другого кошелька.");
      return;
    }
    await run("deposit", (tx) => {
      const [part] = tx.splitCoins(tx.object(pick.coinObjectId), [
        tx.pure.u64(amountRaw.toString()),
      ]);
      tx.moveCall({
        target: `${PACKAGE_ID}::predict_manager::deposit`,
        typeArguments: [DEEP_TYPE],
        arguments: [tx.object(managerId), part],
      });
    });
  };

  const mint = () => {
    const strikeRaw = BigInt(toRaw(Number(strikeHuman) || 0));
    const qtyRaw = BigInt(toRaw(Number(qtyHuman) || 0));
    if (!managerId) return setStatus("Сначала создай менеджер и сделай депозит.");
    if (!oracleInfo?.expiry) return setStatus("Не прочитался expiry оракула.");
    if (!oracleInfo.active) return setStatus("Оракул не активен — дождись ротации бота.");
    if (strikeRaw < BigInt(market.minStrike)) return setStatus("Страйк ниже minStrike.");
    if (qtyRaw <= 0n) return setStatus("Количество > 0.");
    return run(`mint ${isUp ? "UP" : "DOWN"}`, (tx) => {
      const key = tx.moveCall({
        target: `${PACKAGE_ID}::market_key::new`,
        arguments: [
          tx.pure.address(market.oracleId),
          tx.pure.u64(oracleInfo.expiry.toString()),
          tx.pure.u64(strikeRaw.toString()),
          tx.pure.bool(isUp),
        ],
      });
      tx.moveCall({
        target: `${PACKAGE_ID}::predict::mint`,
        typeArguments: [DEEP_TYPE],
        arguments: [
          tx.object(PREDICT_ID),
          tx.object(managerId),
          tx.object(market.oracleId),
          key,
          tx.pure.u64(qtyRaw.toString()),
          tx.object(CLOCK_ID),
        ],
      });
    }).then((digest) => {
      if (!digest) return;
      const t: SavedTrade = {
        digest,
        market: market.asset,
        direction: isUp ? "UP" : "DOWN",
        strike: strikeHuman,
        qty: qtyHuman,
        time: new Date().toISOString(),
      };
      const next = [t, ...trades].slice(0, 50);
      setTrades(next);
      localStorage.setItem("predict_trades", JSON.stringify(next));
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Trade <span style={{ fontSize: 12, color: "var(--text-muted)" }}>testnet · ручная торговля</span></h1>
        <ConnectButton />
      </div>

      <div className="card">
        <div className="card-title">1 · Аккаунт (один раз на кошелек)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={managerId}
            onChange={(e) => {
              setManagerId(e.target.value.trim());
              localStorage.setItem("predict_manager_id", e.target.value.trim());
            }}
            placeholder="PredictManager object id"
            style={{ flex: 1, minWidth: 280 }}
          />
          <button onClick={createManager} disabled={isPending || !account}>
            Создать менеджер
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input value={depositHuman} onChange={(e) => setDepositHuman(e.target.value)} placeholder="DEEP" style={{ width: 120 }} />
          <button onClick={deposit} disabled={isPending || !account}>
            Депозит DEEP в менеджер
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Нужны testnet SUI (газ) + testnet DEEP. Минт списывает премию с баланса менеджера, не из кошелька.
        </div>
      </div>

      <div className="card">
        <div className="card-title">2 · Рынок</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {MARKETS.map((m, i) => (
            <button
              key={m.asset}
              onClick={() => setMarketIdx(i)}
              style={i === marketIdx ? { borderColor: "var(--accent)" } : undefined}
            >
              {m.asset}
            </button>
          ))}
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            spot ≈ {spot !== null ? `$${spot}` : "…"} · strike tick {toHuman(market.tickSize)} · expiry через {expiryLeft}
            {oracleInfo && !oracleInfo.active ? " · ⚠ оракул неактивен" : ""}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">3 · Ставка</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setIsUp(true)} style={isUp ? { borderColor: "var(--green)" } : undefined}>UP ↑</button>
          <button onClick={() => setIsUp(false)} style={!isUp ? { borderColor: "var(--red)" } : undefined}>DOWN ↓</button>
          <label style={{ fontSize: 13 }}>strike $ <input value={strikeHuman} onChange={(e) => setStrikeHuman(e.target.value)} style={{ width: 130 }} /></label>
          <label style={{ fontSize: 13 }}>qty DEEP <input value={qtyHuman} onChange={(e) => setQtyHuman(e.target.value)} style={{ width: 100 }} /></label>
          <button onClick={mint} disabled={isPending || !account} style={{ fontWeight: 700 }}>
            Поставить {isUp ? "UP" : "DOWN"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          Цены в оракул подливает бот каждые ~15 мин. Если транзакция упала по staleness — подожди следующий цикл бота и повтори.
        </div>
      </div>

      {(status || lastDigest) && (
        <div className="card">
          <div className="card-title">Статус</div>
          <div style={{ fontSize: 13 }}>{status}</div>
          {lastDigest && (
            <div style={{ fontSize: 13 }}>
              <a href={suiscanTx(lastDigest)} target="_blank" rel="noreferrer">
                Открыть в Suiscan →
              </a>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">Мои сделки (этот браузер)</div>
        {trades.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Пока пусто — сделай первую ставку выше.</div>
        ) : (
          <table>
            <thead><tr><th>Время</th><th>Маркет</th><th>Сторона</th><th>Strike</th><th>Qty</th><th>TX</th></tr></thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.digest}>
                  <td>{t.time.slice(0, 19).replace("T", " ")}</td>
                  <td>{t.market}</td>
                  <td><span className={`badge badge-${t.direction.toLowerCase()}`}>{t.direction}</span></td>
                  <td>{t.strike}</td>
                  <td>{t.qty}</td>
                  <td><a href={suiscanTx(t.digest)} target="_blank" rel="noreferrer">Suiscan</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

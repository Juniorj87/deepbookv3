import { useEffect, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { testnetCoins, testnetPackageIds, testnetPools } from "@mysten/deepbook-v3";
import { suiscanTx } from "../config";

const CLOCK_ID = "0x6";
const SUI_TYPE = "0x2::sui::SUI";

interface SavedSwap {
  digest: string;
  dir: string;
  amount: string;
  time: string;
}

const loadSwaps = (): SavedSwap[] => {
  try {
    return JSON.parse(localStorage.getItem("spot_swaps") || "[]");
  } catch {
    return [];
  }
};

export default function Spot() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const pool = testnetPools.SUI_DBUSDC;
  const dbusdcCoin = testnetCoins.DBUSDC;
  const deepCoin = testnetCoins.DEEP;
  const pkg = testnetPackageIds.DEEPBOOK_PACKAGE_ID;

  const [suiToUsdc, setSuiToUsdc] = useState(true);
  const [amount, setAmount] = useState("0.1");
  const [suiBal, setSuiBal] = useState<string | null>(null);
  const [usdcBal, setUsdcBal] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [lastDigest, setLastDigest] = useState("");
  const [swaps, setSwaps] = useState<SavedSwap[]>(loadSwaps);

  useEffect(() => {
    if (!account) {
      setSuiBal(null);
      setUsdcBal(null);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const [s, u] = await Promise.all([
          suiClient.getBalance({ owner: account.address }),
          suiClient.getBalance({ owner: account.address, coinType: dbusdcCoin.type }),
        ]);
        if (!stop) {
          setSuiBal((Number(s.totalBalance) / 1e9).toFixed(4));
          setUsdcBal((Number(u.totalBalance) / 1e6).toFixed(2));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      stop = true;
    };
  }, [account, suiClient, dbusdcCoin.type, lastDigest]);

  const swap = async () => {
    if (!account) return setStatus("Подключи кошелек (Sui testnet).");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setStatus("Сумма > 0.");
    setStatus("swap… подпиши в кошельке");
    try {
      const tx = new Transaction();
      if (suiToUsdc) {
        // SUI (base) -> DBUSDC (quote): baseIn из газа, остальное нулевые монеты
        const [suiIn] = tx.splitCoins(tx.gas, [
          tx.pure.u64(Math.floor(amt * 1e9).toString()),
        ]);
        const zeroQuote = tx.moveCall({
          target: "0x2::coin::zero",
          typeArguments: [dbusdcCoin.type],
        });
        const zeroDeep = tx.moveCall({
          target: "0x2::coin::zero",
          typeArguments: [deepCoin.type],
        });
        const [baseOut, quoteOut, deepOut] = tx.moveCall({
          target: `${pkg}::pool::swap_exact_quantity`,
          typeArguments: [SUI_TYPE, dbusdcCoin.type],
          arguments: [
            tx.object(pool.address),
            suiIn,
            zeroQuote,
            zeroDeep,
            tx.pure.u64("0"),
            tx.object(CLOCK_ID),
          ],
        });
        tx.transferObjects([baseOut, quoteOut, deepOut], account.address);
      } else {
        // DBUSDC (quote) -> SUI (base): нужен DBUSDC на балансе
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: dbusdcCoin.type,
        });
        const need = Math.floor(amt * 1e6);
        const pick = coins.data.find(
          (c: { balance: string }) => BigInt(c.balance) >= BigInt(need),
        );
        if (!pick) {
          setStatus("Нет DBUSDC на балансе — сначала свапни SUI → DBUSDC.");
          return;
        }
        const zeroBase = tx.moveCall({
          target: "0x2::coin::zero",
          typeArguments: [SUI_TYPE],
        });
        const [usdcIn] = tx.splitCoins(tx.object(pick.coinObjectId), [
          tx.pure.u64(need.toString()),
        ]);
        const zeroDeep = tx.moveCall({
          target: "0x2::coin::zero",
          typeArguments: [deepCoin.type],
        });
        const [baseOut, quoteOut, deepOut] = tx.moveCall({
          target: `${pkg}::pool::swap_exact_quantity`,
          typeArguments: [SUI_TYPE, dbusdcCoin.type],
          arguments: [
            tx.object(pool.address),
            zeroBase,
            usdcIn,
            zeroDeep,
            tx.pure.u64("0"),
            tx.object(CLOCK_ID),
          ],
        });
        tx.transferObjects([baseOut, quoteOut, deepOut], account.address);
      }
      const res = await signAndExecute({ transaction: tx });
      setLastDigest(res.digest);
      setStatus("swap: OK — монеты уже в кошельке");
      const s: SavedSwap = {
        digest: res.digest,
        dir: suiToUsdc ? "SUI→DBUSDC" : "DBUSDC→SUI",
        amount,
        time: new Date().toISOString(),
      };
      const next = [s, ...swaps].slice(0, 50);
      setSwaps(next);
      localStorage.setItem("spot_swaps", JSON.stringify(next));
    } catch (e) {
      setStatus(`swap: ${(e as Error).message.slice(0, 200)}`);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          Spot <span style={{ fontSize: 12, color: "var(--text-muted)" }}>official DeepBook testnet</span>
        </h1>
        <ConnectButton />
      </div>

      <div className="card">
        <div className="card-title">Пул SUI / DBUSDC (официальный)</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          pool <span style={{ fontFamily: "monospace", fontSize: 12 }}>{pool.address.slice(0, 10)}…{pool.address.slice(-6)}</span>
          {" · "}SUI {suiBal ?? "…"} · DBUSDC {usdcBal ?? "…"}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          SUI для газа и свопов — из testnet faucet. Комиссия платится входным токеном (без DEEP).
        </div>
      </div>

      <div className="card">
        <div className="card-title">Своп без посредников (кошелек → контракт)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setSuiToUsdc(true)} style={suiToUsdc ? { borderColor: "var(--green)" } : undefined}>
            SUI → DBUSDC
          </button>
          <button onClick={() => setSuiToUsdc(false)} style={!suiToUsdc ? { borderColor: "var(--green)" } : undefined}>
            DBUSDC → SUI
          </button>
          <label style={{ fontSize: 13 }}>
            сумма ({suiToUsdc ? "SUI" : "DBUSDC"}){" "}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} />
          </label>
          <button onClick={swap} disabled={isPending || !account} style={{ fontWeight: 700 }}>
            Свапнуть
          </button>
        </div>
        {status && <div style={{ fontSize: 13, marginTop: 8 }}>{status}</div>}
        {lastDigest && (
          <div style={{ fontSize: 13 }}>
            <a href={suiscanTx(lastDigest)} target="_blank" rel="noreferrer">Открыть в Suiscan →</a>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Мои свопы (этот браузер)</div>
        {swaps.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Пока пусто.</div>
        ) : (
          <table>
            <thead><tr><th>Время</th><th>Направление</th><th>Сумма</th><th>TX</th></tr></thead>
            <tbody>
              {swaps.map((s) => (
                <tr key={s.digest}>
                  <td>{s.time.slice(0, 19).replace("T", " ")}</td>
                  <td>{s.dir}</td>
                  <td>{s.amount}</td>
                  <td><a href={suiscanTx(s.digest)} target="_blank" rel="noreferrer">Suiscan</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Public on-chain IDs of the deployed Predict instance (Sui testnet).
// No secrets here — everything is readable on-chain / Suiscan.
export const NETWORK = "testnet";
export const RPC_URL = "https://sui-testnet.publicnode.com:443";

export const PACKAGE_ID =
  "0x28128b43e2e0a55a75ab49f18c8cbb3e60d2511db78a7f3e62a11cc89d0f54ff";
export const PREDICT_ID =
  "0x6d291cd4870f6ad2cedf5f88b9dc0166436257d7f6ed53648aa49cc6fcfc3f41";
export const REGISTRY_ID =
  "0x9441a90691b9074992a5efa05c28ba1c0718f40d888d698bba929c6e02b246ee";
export const CLOCK_ID = "0x6";
export const DEEP_TYPE =
  "0xbb2549a5991ceec6231a9b8bf824ec63b985922d648d5480ed32a2e219f6ca71::deep::DEEP";

// Raw price scaling used by the contracts: human USD * 1e9.
export const SCALE = 1_000_000_000;

export interface MarketDef {
  asset: "BTC" | "ETH" | "DEEP";
  oracleId: string;
  tickSize: number; // raw units
  minStrike: number; // raw units
  priceApi: string;
  fallbackPrice: number; // human USD
}

async function fetchBinance(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
    );
    const j = await r.json();
    const p = parseFloat(j.price);
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

async function fetchBybit(symbol: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`,
    );
    const j = await r.json();
    const p = parseFloat(j?.result?.list?.[0]?.lastPrice);
    return Number.isFinite(p) ? p : null;
  } catch {
    return null;
  }
}

export const MARKETS: MarketDef[] = [
  {
    asset: "BTC",
    oracleId:
      "0xfc56310df693fe772cf209fe3dfc8f93d55268580efc6cefc7d8ed125d7181df",
    tickSize: 1_000_000_000_000,
    minStrike: 60_000_000_000_000,
    priceApi: "BTCUSDT",
    fallbackPrice: 84000,
  },
  {
    asset: "ETH",
    oracleId:
      "0x0f94f40e6f420f890f06f1520fd14c99ebbe3ad433298446cf89dd1d7aa2b30b",
    tickSize: 50_000_000_000,
    minStrike: 1_000_000_000_000,
    priceApi: "ETHUSDT",
    fallbackPrice: 2700,
  },
  {
    asset: "DEEP",
    oracleId:
      "0x5412a767deb90d0998afeb6499a7ab192298618388c0d0c16bf6083b2446b1da",
    tickSize: 1_000_000,
    minStrike: 5_000_000,
    priceApi: "DEEPUSDT",
    fallbackPrice: 0.019,
  },
];

export async function fetchSpot(m: MarketDef): Promise<number> {
  const p =
    m.asset === "DEEP"
      ? await fetchBybit(m.priceApi)
      : await fetchBinance(m.priceApi);
  return p ?? m.fallbackPrice;
}

export const toRaw = (human: number) => Math.floor(human * SCALE);
export const toHuman = (raw: number) => raw / SCALE;
export const suiscanTx = (digest: string) =>
  `https://suiscan.xyz/testnet/tx/${digest}`;

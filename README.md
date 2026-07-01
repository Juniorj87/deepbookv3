![image info](./DeepBook_Logo_White.png)

# DeepBook Predict Research Platform

A comprehensive research and analytics platform for [DeepBook V3 Predict](https://docs.sui.io/standards/deepbookv3) on Sui blockchain. Combines automated trading with deep research capabilities — oracle auditing, prediction reasoning logs, runtime metrics, and a live dashboard.

Built on top of [DeepBook V3](https://deepbook.tech), the next-generation decentralized CLOB on Sui.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Research Platform                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Research     │  │ Oracle       │  │ Metrics      │      │
│  │ Agent        │  │ Auditor      │  │ Collector    │      │
│  │              │  │              │  │              │      │
│  │ reasoning    │  │ on-chain vs  │  │ win rate     │      │
│  │ logging →    │  │ external →   │  │ PnL, →       │      │
│  │ SQLite       │  │ deviation    │  │ velocity     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └────────┬────────┴──────────────────┘               │
│                  ▼                                           │
│         ┌────────────────┐                                   │
│         │  SQLite DB     │                                   │
│         │  (shared)      │                                   │
│         └────────┬───────┘                                   │
│                  │                                           │
│         ┌────────▼───────┐                                   │
│         │  Express API   │ ← port 3003                       │
│         │  (REST + JSON) │                                   │
│         └────────┬───────┘                                   │
│                  │                                           │
│         ┌────────▼───────┐                                   │
│         │  React Dashboard│ ← Vite + Recharts               │
│         │  (5 pages)     │                                   │
│         └────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Trading Engine (existing)                  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Signal       │  │ Trader       │  │ Settlement   │      │
│  │ Engine       │→ │ (PTB mint)   │→ │ & Claims     │      │
│  │              │  │              │  │              │      │
│  │ RSI, EMA,   │  │ oracle-feed  │  │ redeem()     │      │
│  │ Momentum,   │  │ .cjs         │  │ every 8h     │      │
│  │ Funding     │  │ (PM2)        │  │ cycle        │      │
│  └──────────────┘  └──────┬───────┘  └──────────────┘      │
│                           │                                  │
│                  POST /api/predictions                       │
│                  (logs every mint to Research Platform)      │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** Research modules are fully independent. Trader continues running even if Dashboard, Oracle Auditor, or Metrics Collector are offline. Dashboard only reads data — never writes to trading state.

---

## Research Modules

### 1. Research Agent

Logs the reasoning behind every prediction to SQLite.

**Captured per prediction:**
- Timestamp, market (BTC/ETH/DEEP), direction (UP/DOWN)
- Strike price, confidence score
- Signal indicators: RSI, EMA, Momentum, Funding Rate, Volatility, BTC Correlation
- Explanation text, transaction digest, status

**Integration:** Every mint in `oracle-feed.cjs` (ATOMIC and TRADE paths) calls `logPredictionToResearch()` via HTTP POST to the research API.

### 2. Oracle Auditor

Periodically compares on-chain oracle prices with Binance/Bybit external prices.

**Tracked per snapshot:**
- On-chain spot price vs external spot price
- Deviation percentage
- API latency (ms)
- Oracle spot age (ms)
- Oracle status (ACTIVE/EXPIRED/SETTLED)

**Runs:** Every 60 seconds via PM2 `oracle-audit` process.

### 3. Metrics Collector

Aggregates runtime metrics from `positions_state.json` and `dashboard_state.json`.

**Metrics:**
- Total positions, open/claimed/failed counts
- Win rate by market and overall
- Total PnL (DEEP)
- Trade velocity (trades/hour, avg time between trades)
- Session stats (last 1h, last 24h)
- Live signal data (RSI, confidence, direction per market)

**Runs:** Every 5 minutes via PM2 `metrics-collector` process.

---

## Dashboard

Modern React + Vite dashboard with dark theme, served on port 3003.

### Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Overview: positions, win rate, velocity, oracle health, active signals, system health |
| **Research** | Full prediction log with filtering by status, reasoning details, SuiScan links |
| **Oracle Audit** | Deviation report, expandable history charts, period selector (1h-72h) |
| **Metrics** | Win rate timeline, pie charts, bar charts, market breakdown |
| **History** | Complete prediction log with expandable detail panels |

### Features

- Auto-refresh (15-30 second intervals)
- Real-time data from SQLite via REST API
- Recharts for all visualizations
- Color-coded status badges
- Responsive design (works on mobile)

### Dashboard Cards

- System Status, Signals Today, Markets
- Win Rate, Confidence, Settlements
- Claims, Latest Prediction
- Oracle Health, Recent Activity

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with DB stats |
| GET | `/api/live` | Real-time metrics from positions + dashboard |
| GET | `/api/stats` | Aggregated statistics |
| GET | `/api/predictions` | Prediction list (with limit) |
| POST | `/api/predictions` | Log new prediction |
| PATCH | `/api/predictions/:id` | Update prediction status |
| GET | `/api/settlements` | Recent settlements |
| POST | `/api/settlements` | Log settlement |
| GET | `/api/oracles` | Oracle deviation report |
| GET | `/api/oracles/:id/history` | Oracle deviation history |
| POST | `/api/oracles/snapshot` | Log oracle snapshot |
| GET | `/api/metrics/hourly` | Hourly metrics for charts |
| GET | `/api/metrics/export` | Full JSON export |
| GET | `/api/wincrate/timeline` | Win rate by hour (up to 7 days) |

---

## Tech Stack

- **Backend:** Node.js, Express, SQLite (better-sqlite3)
- **Frontend:** React 18, Vite, Recharts, React Router
- **Trading:** Sui Move contracts, TypeScript, PM2
- **Data:** Binance/Bybit APIs, Sui RPC, SQLite

---

## Getting Started

### Prerequisites

- Node.js 18+
- PM2 (`npm install -g pm2`)
- Sui CLI (for contract interaction)

### Installation

```bash
# Install research platform dependencies
cd scripts/research
npm install

# Install dashboard dependencies
cd dashboard
npm install

# Build dashboard
npm run build
```

### Running

```bash
# Start all research services
pm2 start ecosystem.config.cjs --only research-platform
pm2 start ecosystem.config.cjs --only oracle-audit
pm2 start ecosystem.config.cjs --only metrics-collector

# Or start everything
pm2 start ecosystem.config.cjs
```

Dashboard: http://localhost:3003

---

## Live Metrics

Current system stats (as of deployment):

| Metric | Value |
|--------|-------|
| Total Positions | 2,317+ |
| Win Rate | ~83% |
| Active Markets | BTC, ETH, DEEP |
| Trade Velocity | ~8.8 trades/hour |
| Oracle Audit Interval | 60 seconds |
| Metrics Collection | 5 minutes |

---

## Project Structure

```
deepbook-sdk/
├── packages/
│   ├── deepbook/          # Core DeepBook V3 protocol
│   ├── predict/           # Predict module (options trading)
│   └── ...
├── crates/
│   ├── server/            # Rust indexer
│   └── indexer/
├── scripts/
│   ├── research/          # ← Research Platform
│   │   ├── db.ts          # SQLite wrapper
│   │   ├── research-agent.ts
│   │   ├── oracle-auditor.ts
│   │   ├── oracle-audit-service.ts
│   │   ├── metrics-collector.ts
│   │   ├── metrics-service.ts
│   │   ├── import-history.ts
│   │   ├── index.ts       # Express API server
│   │   ├── dashboard/     # React + Vite frontend
│   │   └── package.json
│   └── services/
│       ├── multi-oracle-feed.ts
│       └── signal_engine_v2.ts
├── dist/
│   └── oracle-feed.cjs    # Trading engine (compiled)
├── ecosystem.config.cjs   # PM2 configuration
└── .env                   # Environment variables
```

---

## Roadmap

### Completed

- [x] Research Agent with SQLite logging
- [x] Oracle Auditor (on-chain vs external comparison)
- [x] Metrics Collector (runtime aggregation)
- [x] React Dashboard (5 pages, dark theme, charts)
- [x] Integration with trading engine (every mint logged)
- [x] Settlement/claim logging (4 points in claim loop)
- [x] Historical data import (2,300+ positions)
- [x] Production-ready PM2 deployment

### Planned

- [ ] Telegram/Slack alerts for anomalies
- [ ] Confidence threshold tuning based on historical win rate
- [ ] ML model for signal scoring (backtesting framework)
- [ ] Multi-oracle comparison dashboard
- [ ] Export to CSV/PDF
- [ ] Automated oracle rotation alerts
- [ ] Performance benchmarking (latency per market)

---

## Design Principles

1. **Independence** — Research modules never block trading. Dashboard only reads.
2. **Non-invasive** — Existing trading engine logic untouched. Integration via HTTP POST only.
3. **Observable** — Every prediction, settlement, and oracle update is logged with full context.
4. **Scalable** — SQLite for local dev, can swap to PostgreSQL for production.
5. **Developer-friendly** — Clean API, typed interfaces, dark theme dashboard.

---

## DeepBook V3 Reference

- [Package and Pools](https://docs.google.com/document/d/1uK4MNqYa0LdhVqBD4KqOcWG1N1nNNe3JwbeUZc1kH1I)
- [Contract Documentation](https://docs.sui.io/standards/deepbookv3)
- [SDK Documentation](https://docs.sui.io/standards/deepbookv3-sdk)
- [Example SDK Usage](https://github.com/MystenLabs/ts-sdks/tree/main/packages/deepbook-v3/examples)
- [Whitepaper](https://cdn.prod.website-files.com/65fdccb65290aeb1c597b611/66059b44041261e3fe4a330d_deepbook_whitepaper.pdf)
- [Rust SDK (Unofficial)](https://github.com/hoh-zone/sui-deepbookv3)

---

## License

MIT

# 🚀 Trade Master

> **Semi-automated trading system** integrating Zerodha Kite Connect v3 with an interactive Telegram Bot and full REST API suite.

---

## ✨ Features

- **Real-time market data** via Zerodha KiteTicker WebSocket with automatic reconnection
- **Complete Kite Connect v3 API Integration**:
  - **Account & Funds**: User Profile, Cash & Collateral Margins for Equity & Commodity segments
  - **Portfolio**: Long-term Demat Holdings, Intraday/Net Positions, Product Conversion (MIS ↔ CNC/NRML), Holding Auctions
  - **Market Quotes**: Last Traded Price (LTP), OHLC quotes, full Depth & Volume quotes, Historical Candle data
  - **Orders & Execution**: Complete Order Book, Executed Trade Fills, Order Modification & Cancellation
  - **GTT (Good Till Triggered)**: Create, list, query, and cancel single & two-leg OCO GTT orders
  - **Price Alerts**: Create, list, modify, delete, and view trigger history for Kite price alerts
  - **Instruments**: Daily dump of 117,000+ tradable instruments across NSE, BSE, NFO, BFO, MCX, CDS
- **Interactive Telegram Bot**:
  - Check your portfolio, funds, and quotes from anywhere (even on weekends / Sundays!)
  - Signal approval cards with inline Yes/No buttons & 90-second expiry
  - Whitelist security locked to your numeric Telegram User ID
  - Clean HTML message formatting prevents entity parsing conflicts
- **3 Strategy Rule Types**: Price Breakout, Moving Average Crossover, Index Options Momentum
- **Emergency Kill Switch**: Liquidates all open positions & cancels pending orders instantly via `/kill_switch`
- **Risk Management Guardrails**: Daily loss limit, max simultaneous positions, max order value cap
- **Automated Verification Suite**: `npm run test:api` tests all 14 API endpoints & local modules with latency reporting

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│               Telegram Bot  /  Express REST API                 │
│  /funds, /holdings, /ltp, /quote, /orders, /kill_switch, etc.   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                      Trade Master Core                          │
│  Portfolio Mgr │ User Mgr │ Market Data Mgr │ GTT & Alert Mgr   │
│  Strategy Engine │ Risk Manager │ Order Manager │ Instruments   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                    Zerodha Kite Connect v3                      │
│       WebSocket (KiteTicker)  │  REST API (api.kite.trade)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
trade-master/
├── src/
│   ├── auth/
│   │   ├── authServer.ts       # Express server (OAuth + Kite REST API routes)
│   │   └── sessionManager.ts   # Daily token restore & IST freshness check
│   ├── alerts/
│   │   └── alertManager.ts     # Kite Connect Alerts API client
│   ├── bot/
│   │   ├── bot.ts              # Telegraf bot setup, all commands & callbacks
│   │   ├── formatters.ts       # Safe HTML Telegram message formatters
│   │   ├── keyboards.ts        # Interactive inline keyboard builders
│   │   └── commands/           # Strategy & risk command handlers
│   ├── engine/
│   │   ├── ticker.ts           # KiteTicker WebSocket streaming client
│   │   ├── candleAggregator.ts # Tick → 1m/3m/5m OHLCV candle aggregator
│   │   └── indicatorEngine.ts  # EMA, SMA, RSI, MACD calculation & evaluation
│   ├── instruments/
│   │   ├── instrumentManager.ts # Instrument master cache (117k+ instruments)
│   │   └── strikeResolver.ts   # ATM/OTM option contract resolver
│   ├── market/
│   │   └── marketDataManager.ts # Quotes, LTP, OHLC & Historical data manager
│   ├── orders/
│   │   ├── orderManager.ts     # Order placement, execution, trades & order book
│   │   └── gttManager.ts       # Good-Till-Triggered (GTT) order manager
│   ├── portfolio/
│   │   └── portfolioManager.ts # Holdings, positions, conversion, auctions
│   ├── risk/
│   │   ├── riskManager.ts      # Pre-trade risk validation & daily P&L
│   │   └── killSwitch.ts       # Emergency liquidation & order cancellation
│   ├── storage/
│   │   └── storage.ts          # Atomic JSON configuration persistence
│   ├── types/
│   │   ├── index.ts            # Shared domain types & interfaces
│   │   └── kiteconnect.d.ts    # Complete KiteConnect & KiteTicker type definitions
│   ├── user/
│   │   └── userManager.ts      # Profile and funds/margins manager
│   ├── config.ts               # Environment configuration loader
│   └── index.ts                # Main orchestration entry point
├── scripts/
│   └── testAllApis.ts          # Automated 14-endpoint API test runner
├── config/
│   ├── strategies.json         # Strategy rules database
│   └── risk_management.json    # Risk limit thresholds
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Prerequisites

1. **Node.js** v18+ ([nodejs.org](https://nodejs.org))
2. **A Zerodha account** with a registered [Kite Connect app](https://developers.kite.trade/)
3. **A Telegram Bot** created via [@BotFather](https://t.me/BotFather)

---

## ⚙️ Setup & Configuration

### 1. Configure `.env`

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your actual credentials:

```env
KITE_API_KEY=your_kite_api_key
KITE_API_SECRET=your_kite_api_secret
TELEGRAM_BOT_TOKEN=1234567890:ABCDefGHIjklMNOpqrstUVWXyz
TELEGRAM_ALLOWED_USER_ID=987654321
PORT=3000
REDIRECT_URL=http://localhost:3000/callback
SIGNAL_TIMEOUT_SECONDS=90
```

> **Find your Telegram User ID**: Message [@userinfobot](https://t.me/userinfobot) on Telegram to get your numeric user ID.

### 2. Install & Build

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start in development mode
npm run dev

# Or start in production
npm start
```

---

## 🧪 Testing All Modules & APIs (Even on Sunday!)

You can run the built-in automated test suite at any time, including weekends and after market hours:

```bash
npm run test:api
```

This runs an automated diagnostic of all 14 core subsystems and prints a detailed latency and status report:

```
============================================================
📊 TEST RESULTS SUMMARY
============================================================
Status  Module              Endpoint                           Time      Details
----------------------------------------------------------------------------------------------------
✅ PASS  RiskManager         Local Config & In-Memory Limits    1ms       Max daily loss: ₹5000, Max open pos: 3, Trading: true
✅ PASS  UserManager         GET /user/profile                  310ms     User ID: XYZ, Name: John Doe, Broker: ZERODHA
✅ PASS  UserManager         GET /user/margins                  174ms     Equity Cash: ₹1000
✅ PASS  PortfolioManager    GET /portfolio/holdings            140ms     Holdings Count: 15, Total Value: ₹1234, P&L: ₹123
✅ PASS  PortfolioManager    GET /portfolio/positions           573ms     Net Positions: 0, Day Positions: 0
✅ PASS  PortfolioManager    GET /portfolio/holdings/auctions   143ms     Auctions Count: 0
✅ PASS  MarketDataManager   GET /quote/ltp                     5142ms    NSE:BAJFINANCE: ₹928.95, NSE:ITC: ₹257.9, NSE:INFY: ₹0
✅ PASS  MarketDataManager   GET /quote/ohlc                    278ms     INFY Close: ₹0, LTP: ₹0
✅ PASS  MarketDataManager   GET /quote                         286ms     INFY Volume: 0, High: ₹0, Low: ₹0
✅ PASS  OrderManager        GET /orders                        131ms     Orders Count: 0
✅ PASS  OrderManager        GET /trades                        140ms     Trades Count: 0
✅ PASS  GTTManager          GET /gtt/triggers                  129ms     GTT Triggers Count: 0
✅ PASS  AlertManager        GET /alerts                        142ms     Alerts Count: 0
✅ PASS  InstrumentManager   GET /instruments                   6ms       Loaded NSE Instruments: 10391
============================================================
Summary: 14 Passed, 0 Failed, 0 Skipped (14 total tests)
```

---

## 🔐 Daily Zerodha Authentication

Zerodha access tokens expire daily at ~7:30 AM IST. Each morning:

1. The bot automatically sends a login reminder to your Telegram.
2. Click the login URL or open `http://localhost:3000/login` in your browser.
3. Log in with your Zerodha credentials & TOTP.
4. You will be redirected to `http://localhost:3000/callback` and see:
   > **✅ Zerodha Authentication Successful!**
5. All trading subsystems, live WebSocket streams, and portfolio sync will initialize automatically.

---

## 💬 Telegram Bot Command Reference

All commands are accessible directly from your Telegram chat:

### 👤 Account & Portfolio
| Command | Description | Example |
|---|---|---|
| `/profile` | View Zerodha user profile details | `/profile` |
| `/funds` or `/margins` | View cash, available balance, collateral, utilised margin | `/funds` |
| `/holdings` | View long-term equity delivery holdings, invested vs current value, P&L | `/holdings` |
| `/positions` | View today's open and closed intraday / net positions | `/positions` |
| `/auctions` | View list of holdings currently in auction | `/auctions` |
| `/convert_pos <sym> <new> <qty>` | Convert position product (e.g. MIS → CNC or NRML) | `/convert_pos INFY CNC 10 MIS NSE` |

### 📈 Market Quotes & Ticker
| Command | Description | Example |
|---|---|---|
| `/ltp <symbol>` | Get Last Traded Price for one or more symbols | `/ltp INFY`<br>`/ltp BAJFINANCE, ITC, RELIANCE` |
| `/quote <symbol>` | Full quote with depth, volume, OHLC, circuit limits | `/quote RELIANCE`<br>`/quote NSE:NIFTY 50` |
| `/ohlc <symbol>` | Open, High, Low, Close quotes and % change | `/ohlc INFY, TCS` |

### 📋 Orders, Trades & GTT
| Command | Description | Example |
|---|---|---|
| `/orders` | View today's order book (status, quantity, prices) | `/orders` |
| `/trades` | View all executed trade fills for the day | `/trades` |
| `/gtt` | View active Good-Till-Triggered (GTT) orders | `/gtt` |
| `/alerts` | View configured Kite price alerts | `/alerts` |

### ⚡ Strategy & Risk Management
| Command | Description | Example |
|---|---|---|
| `/help` or `/start` | View full interactive command palette and guide | `/help` |
| `/list_rules` | View all configured strategy rules | `/list_rules` |
| `/set_rule <json>` | Add a new strategy rule | See examples below |
| `/del_rule <id>` | Delete a strategy rule by ID | `/del_rule 1` |
| `/view_risk` | View current risk limits and today's P&L | `/view_risk` |
| `/set_risk <key> <val>` | Update risk parameters in real-time | `/set_risk max_daily_loss 7500` |
| `/kill_switch` or `/panic` | 🚨 Emergency liquidation: cancels orders + closes positions | `/kill_switch` |
| `/status` | Check system status (auth, trading active, port) | `/status` |
| `/login` | Get the Zerodha OAuth login link | `/login` |

---

## 🌐 Express REST API Reference

When the app is running on port `3000`, all Kite Connect v3 features can also be queried directly via REST:

### Portfolio Endpoints
- `GET /portfolio/holdings` (or `/api/portfolio/holdings`) — List long-term Demat holdings
- `GET /portfolio/positions` (or `/api/portfolio/positions`) — List day & net positions
- `PUT /portfolio/positions` (or `/api/portfolio/positions`) — Convert position product type
- `GET /portfolio/holdings/auctions` (or `/api/portfolio/holdings/auctions`) — List holding auctions

### User & Margin Endpoints
- `GET /user/profile` (or `/api/user/profile`) — User profile details
- `GET /user/margins` (or `/api/user/margins`) — Margins for all segments
- `GET /user/margins/:segment` (or `/api/user/margins/equity`) — Equity or commodity margins

### Market Quotes Endpoints
- `GET /quote?i=NSE:INFY&i=NSE:RELIANCE` — Full market quotes with depth
- `GET /quote/ltp?i=NSE:INFY` — Last traded price only
- `GET /quote/ohlc?i=NSE:INFY` — Open, High, Low, Close quotes
- `GET /quote/historical?token=408065&interval=day&from=2024-01-01&to=2024-12-31` — Historical candles
- `GET /instruments` — CSV dump of all tradable instruments
- `GET /instruments/:exchange` (e.g. `/instruments/NSE`) — Instruments filtered by exchange

### Orders & Trades Endpoints
- `GET /orders` — Today's order book
- `GET /orders/:order_id` — Order history details
- `GET /trades` — All executed trades
- `GET /orders/:order_id/trades` — Trades for a specific order

### GTT (Good Till Triggered) Endpoints
- `GET /gtt/triggers` — List all GTT triggers
- `GET /gtt/triggers/:id` — Details of a specific GTT trigger
- `POST /gtt/triggers` — Place a new GTT trigger
- `DELETE /gtt/triggers/:id` — Delete a GTT trigger

### Price Alerts Endpoints
- `GET /alerts` — List all alerts
- `GET /alerts/:uuid` — Details of a specific alert
- `POST /alerts` — Create a new alert
- `PUT /alerts/:uuid` — Modify an alert
- `DELETE /alerts?uuid=:uuid` — Delete an alert
- `GET /alerts/:uuid/history` — Trigger history of an alert

#### Example REST request (cURL):
```bash
# Get funds & margins
curl http://localhost:3000/api/user/margins

# Get Demat holdings
curl http://localhost:3000/api/portfolio/holdings

# Get LTP quote
curl "http://localhost:3000/api/quote/ltp?i=NSE:INFY"
```

---

## 📋 Strategy Rule Examples

### 1. Price Breakout (Equities)
```
/set_rule {"type":"PRICE_RANGE","symbol":"INFY","exchange":"NSE","upper":1950,"lower":1850,"action":"BUY","qty":10,"product":"MIS"}
```
Triggers a BUY signal when INFY breaks above ₹1,950 or below ₹1,850.

### 2. EMA Crossover (Futures)
```
/set_rule {"type":"MA_CROSS","symbol":"NIFTY24NOVFUT","exchange":"NFO","timeframe":"5m","fastMA":9,"slowMA":21,"maType":"EMA","action":"BUY","qty":50,"product":"MIS"}
```
Triggers when 9 EMA crosses above 21 EMA on 5-minute candles.

### 3. RSI Index Options
```
/set_rule {"type":"INDEX_OPTION","underlying":"NIFTY","timeframe":"3m","indicator":"RSI","condition":"> 60","strikeOffset":"ATM","optionType":"CE","qty":50,"product":"MIS","expiryType":"weekly"}
```
Triggers a BUY CE signal on ATM options contract when NIFTY RSI(14) > 60 on 3-minute bars.

---

## 🛡️ Risk Management Settings

Settings are stored in `config/risk_management.json` and updated via `/set_risk`:

| Key | Description | Default |
|---|---|---|
| `max_daily_loss` | Maximum loss limit in ₹ before trading halts | `5000` |
| `max_open_positions` | Maximum allowed simultaneous open positions | `3` |
| `max_order_value` | Maximum gross order value per signal in ₹ | `100000` |
| `trading_enabled` | Master trading kill switch | `true` |

---

## 🚨 Emergency Kill Switch

Sending `/kill_switch` or `/panic` in Telegram immediately:
1. Sets `trading_enabled = false`
2. Cancels all pending/open orders via Kite Connect
3. Liquidates all open positions using MARKET orders
4. Sends an execution report with realized and unrealized P&L

---

## ⚠️ Disclaimer

*This software is for educational and testing purposes. Algorithmic and semi-automated trading involves substantial risk of financial loss. Verify with paper trading or small quantities before deploying with real capital.*

---

*Built with ❤️ using TypeScript, Telegraf, Express, and Zerodha Kite Connect v3*

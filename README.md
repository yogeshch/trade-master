# 🚀 Trade Master

> **Semi-automated trading system** integrating Zerodha Kite Connect v3 with an interactive Telegram Bot interface.

## ✨ Features

- **Real-time market data** via Zerodha KiteTicker WebSocket
- **3 strategy rule types**: Price Breakout, Moving Average Crossover, Index Options Momentum
- **Semi-automated execution**: Signal approval cards with inline Yes/No buttons
- **90-second signal expiry** — never execute on stale prices
- **Emergency Kill Switch** — liquidates all positions instantly via `/kill_switch`
- **Risk Management**: Daily loss limit, max positions, max order value guardrails
- **Telegram-only interface** — locked down to your numeric User ID
- **Persistent JSON config** — no database setup needed

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Interface                       │
│  /set_rule, /set_risk, /kill_switch + Signal Inline Cards   │
└───────────────────────────┬─────────────────────────────────┘
                            │ (Long Polling)
┌───────────────────────────▼─────────────────────────────────┐
│                    Core Node.js Engine                      │
│  Strategy Engine ←→ Risk Manager ←→ Order Execution        │
│  Instrument Manager ←→ Candle Aggregator ←→ Indicators     │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Zerodha Kite Connect v3                    │
│         WebSocket (ticks) + REST API (orders)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
trade-master/
├── src/
│   ├── auth/
│   │   ├── authServer.ts       # Express OAuth server (/login, /callback)
│   │   └── sessionManager.ts   # Daily session restore & freshness check
│   ├── bot/
│   │   ├── bot.ts              # Telegraf bot, commands, signal dispatch
│   │   ├── formatters.ts       # Telegram message formatters
│   │   ├── keyboards.ts        # Inline keyboard builders
│   │   └── commands/
│   │       ├── setRule.ts      # /set_rule handler
│   │       ├── listRules.ts    # /list_rules handler
│   │       ├── delRule.ts      # /del_rule handler
│   │       ├── riskCommands.ts # /view_risk, /set_risk handlers
│   │       └── killSwitch.ts   # /kill_switch, /panic handlers
│   ├── engine/
│   │   ├── ticker.ts           # KiteTicker WebSocket client
│   │   ├── candleAggregator.ts # Tick → 1m/3m/5m OHLCV bars
│   │   └── indicatorEngine.ts  # EMA, SMA, RSI, MACD evaluation
│   ├── instruments/
│   │   ├── instrumentManager.ts # Instrument master cache & lookup
│   │   └── strikeResolver.ts    # ATM/OTM option strike resolver
│   ├── orders/
│   │   └── orderManager.ts     # Kite REST API wrapper
│   ├── risk/
│   │   ├── riskManager.ts      # Risk validation & P&L tracking
│   │   └── killSwitch.ts       # Emergency liquidation logic
│   ├── storage/
│   │   └── storage.ts          # Atomic JSON file read/write
│   ├── types/
│   │   └── index.ts            # Shared TypeScript interfaces
│   ├── config.ts               # dotenv config loader
│   └── index.ts                # Main orchestration entry point
├── config/
│   ├── strategies.json         # Persisted strategy rules
│   └── risk_management.json    # Risk limit settings
├── .env.example                # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Prerequisites

1. **Node.js** v18+ ([nodejs.org](https://nodejs.org))
2. **A Zerodha Demat account** with API access
3. **A Telegram Bot** (created via [@BotFather](https://t.me/BotFather))

---

## 🔑 Step 1: Create a Kite Connect App

1. Log in to the [Kite Developer Console](https://developers.kite.trade/)
2. Click **"Create new app"**
3. Fill in the details:
   - **App name**: Trade Master (or anything you prefer)
   - **App type**: `Connect`
   - **Redirect URL**: `http://localhost:3000/callback`
4. After creation, note your **API Key** and **API Secret**
5. Ensure your account has the required permissions (equity, F&O)

> **Note**: The Kite Connect API has a subscription cost (~₹2,000/month). Check the [pricing page](https://kite.trade/docs/connect/v3/) before proceeding.

---

## 🤖 Step 2: Create a Telegram Bot

1. Open Telegram and chat with [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Give it a name (e.g., "Trade Master") and a username (e.g., `tradeMasterBot`)
4. Copy the **Bot Token** (looks like `1234567890:ABCDefGHIjklMNOpqrstUVWXyz`)

**Get your numeric Telegram User ID:**
1. Chat with [@userinfobot](https://t.me/userinfobot)
2. It will reply with your numeric User ID (e.g., `987654321`)

---

## ⚙️ Step 3: Configure Environment

```bash
# Copy the template
cp .env.example .env
```

Edit `.env`:

```env
KITE_API_KEY=your_actual_api_key
KITE_API_SECRET=your_actual_api_secret
TELEGRAM_BOT_TOKEN=1234567890:ABCDefGHIjklMNOpqrstUVWXyz
TELEGRAM_ALLOWED_USER_ID=987654321
PORT=3000
REDIRECT_URL=http://localhost:3000/callback
SIGNAL_TIMEOUT_SECONDS=90
```

---

## 📦 Step 4: Install & Build

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start in production
npm start

# OR run in development mode (no compilation)
npm run dev
```

---

## 🔐 Step 5: Daily Authentication

Kite Connect access tokens expire **every day at midnight**. Each trading day:

1. The bot sends you a login reminder at **8:45 AM IST**
2. Click the login URL (or visit `http://localhost:3000/login`)
3. Log in to Zerodha in your browser
4. You'll be redirected back and see: *"✅ Zerodha Authentication Successful!"*
5. Telegram will notify you: *"✅ Zerodha Authentication Successful. Strategy engine initialized."*

### Using ngrok (for external access)

If your server isn't publicly accessible, use ngrok to expose the callback:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000

# Copy the HTTPS forwarding URL, e.g.:
# https://abc123.ngrok.io

# Update .env:
REDIRECT_URL=https://abc123.ngrok.io/callback
```

Then update the **Redirect URL** in your Kite Connect app settings to match.

---

## 💬 Telegram Command Reference

| Command | Description |
|---|---|
| `/start` | Show help menu |
| `/login` | Get the Zerodha authentication link |
| `/status` | Check system status (auth, trading enabled) |
| `/list_rules` | View all active strategy rules |
| `/set_rule <json>` | Add a new strategy rule |
| `/del_rule <id>` | Delete a rule by its ID |
| `/view_risk` | View risk settings and today's P&L |
| `/set_risk <key> <val>` | Update a risk limit |
| `/kill_switch` | 🚨 Emergency: cancel orders + liquidate all positions |
| `/panic` | Same as /kill_switch |
| `/positions` | View current open positions |

---

## 📋 Strategy Rule Examples

### 1. Price Breakout (Equities)

```
/set_rule {"type":"PRICE_RANGE","symbol":"INFY","exchange":"NSE","upper":1950,"lower":1850,"action":"BUY","qty":10,"product":"MIS"}
```

Triggers a BUY signal when INFY breaks above ₹1,950.

### 2. EMA Crossover (Futures)

```
/set_rule {"type":"MA_CROSS","symbol":"NIFTY24NOVFUT","exchange":"NFO","timeframe":"5m","fastMA":9,"slowMA":21,"maType":"EMA","action":"BUY","qty":50,"product":"MIS"}
```

Triggers when EMA 9 crosses above EMA 21 on 5-minute NIFTY Futures candles.

### 3. RSI-based Options (Index)

```
/set_rule {"type":"INDEX_OPTION","underlying":"NIFTY","timeframe":"3m","indicator":"RSI","condition":"> 60","strikeOffset":"ATM","optionType":"CE","qty":50,"product":"MIS","expiryType":"weekly"}
```

Triggers a BUY CE signal at ATM strike when NIFTY RSI(14) > 60 on 3-min candles.

---

## 🛡️ Risk Management

### Available Settings

| Key | Description | Default |
|---|---|---|
| `max_daily_loss` | Stop trading if day P&L drops below -X | `5000` |
| `max_open_positions` | Maximum simultaneous open positions | `3` |
| `max_order_value` | Cap exposure per single order | `100000` |
| `trading_enabled` | Master on/off switch | `true` |

### Examples

```
/set_risk max_daily_loss 7500
/set_risk max_open_positions 5
/set_risk max_order_value 50000
/set_risk trading_enabled false
```

---

## 🚨 Kill Switch

The `/kill_switch` command (or `/panic`) will:

1. ✅ Immediately disable trading (`trading_enabled = false`)
2. ✅ Cancel all pending/open orders
3. ✅ Square off all net open positions using Market orders
4. ✅ Send you a full status report with final P&L

---

## ⚡ Signal Flow

```
Tick arrives (WebSocket)
  → Candle aggregated (1m/3m/5m)
    → Indicator evaluated on candle close
      → Signal triggered
        → Risk check (loss limit, position count, order value)
          → Telegram signal card sent with ✅/❌ buttons
            → User taps ✅ within 90 seconds
              → Order placed via Kite REST API
                → Order ID returned in Telegram
```

If the user doesn't respond within **90 seconds**, the signal expires automatically.

---

## 🖥️ Deployment on Linux VPS

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone <your-repo> trade-master
cd trade-master
npm install
cp .env.example .env
nano .env  # Fill in your credentials

# Build
npm run build

# Run with PM2 (process manager)
npm install -g pm2
pm2 start dist/index.js --name trade-master
pm2 startup  # Enable auto-start on reboot
pm2 save

# View logs
pm2 logs trade-master
```

---

## 🔍 Troubleshooting

| Issue | Solution |
|---|---|
| `Missing required environment variable` | Ensure `.env` is filled in correctly |
| `WebSocket disconnected` | Check internet connection; bot will auto-reconnect |
| `No option contract found` | Instrument master may be stale — run `/login` to refresh |
| `Order placement failed` | Check Kite API status; ensure sufficient margin |
| `Risk check blocked signal` | Use `/view_risk` to see current P&L and position count |
| Bot not responding | Ensure `TELEGRAM_ALLOWED_USER_ID` matches your actual ID |

---

## ⚠️ Disclaimer

This software is for educational and informational purposes only. Trading financial instruments involves substantial risk of loss. The authors are not responsible for any financial losses incurred. Always test with paper trading before using real capital.

---

*Built with ❤️ using Node.js, TypeScript, Telegraf, and Zerodha Kite Connect v3*

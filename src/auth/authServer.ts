// ============================================================
// Trade Master – Zerodha OAuth & REST API Express Server
// Provides OAuth endpoints and full REST access to Kite APIs.
// ============================================================
import express, { Request, Response, NextFunction } from 'express';
import { KiteConnect } from 'kiteconnect';
import { config } from '../config';
import { writeSession } from '../storage/storage';
import { isAuthenticated } from './sessionManager';
import { userManager } from '../user/userManager';
import { portfolioManager } from '../portfolio/portfolioManager';
import { marketDataManager } from '../market/marketDataManager';
import { orderManager } from '../orders/orderManager';
import { gttManager } from '../orders/gttManager';
import { alertManager } from '../alerts/alertManager';
import { instrumentManager } from '../instruments/instrumentManager';
import type { Exchange, PositionConversionParams, CreateGTTParams } from '../types';

let kiteInstance: KiteConnect | null = null;
let telegramNotifyFn: ((msg: string) => Promise<void>) | null = null;
let authSuccessCallback: ((accessToken: string) => Promise<void>) | null = null;

/**
 * Register a callback to send Telegram notifications from auth events.
 */
export function registerTelegramNotifier(fn: (msg: string) => Promise<void>): void {
  telegramNotifyFn = fn;
}

/**
 * Register a callback to initialize or re-initialize trading engine after successful OAuth.
 */
export function registerAuthSuccessHandler(fn: (accessToken: string) => Promise<void>): void {
  authSuccessCallback = fn;
}

/**
 * Get or create the KiteConnect instance.
 */
export function getKiteInstance(): KiteConnect {
  if (!kiteInstance) {
    kiteInstance = new KiteConnect({ api_key: config.kiteApiKey });
  }
  return kiteInstance;
}

/**
 * Set access token on the existing kite instance (called after OAuth).
 */
export function setAccessToken(token: string): void {
  getKiteInstance().setAccessToken(token);
}

/**
 * Middleware ensuring valid authentication for Kite REST endpoints.
 */
function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  if (!isAuthenticated()) {
    res.status(401).json({
      status: 'error',
      message: 'Not authenticated with Zerodha. Please log in via /login.',
    });
    return;
  }
  next();
}

/**
 * Helper to extract instrument array from query params (e.g. ?i=NSE:INFY&i=NSE:RELIANCE or ?i=INFY,RELIANCE).
 */
function extractInstruments(req: Request): string[] {
  const i = req.query['i'];
  if (!i) return [];
  if (Array.isArray(i)) {
    return i.flatMap((item) => String(item).split(/[\s,]+/)).filter(Boolean);
  }
  return String(i).split(/[\s,]+/).filter(Boolean);
}

/**
 * Helper to generate modern HTML dashboard displaying system status and all bot/API commands.
 */
function renderDashboardHtml(options: { success?: boolean; alertTitle?: string; alertMessage?: string } = {}): string {
  const authed = isAuthenticated();
  const alertBox = options.alertTitle
    ? `<div class="alert ${options.success ? 'alert-success' : 'alert-danger'}">
        <h3>${options.alertTitle}</h3>
        <p>${options.alertMessage || ''}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trade Master – Control Center &amp; API Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --success: #10b981;
      --danger: #ef4444;
      --code-bg: #0b1120;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      gap: 16px;
    }
    .brand h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .brand p { color: var(--text-muted); font-size: 14px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3); }
    .btn {
      display: inline-block;
      background: var(--accent);
      color: #000;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 6px;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--accent-hover); }
    .alert {
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; }
    .alert-danger { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
    .alert h3 { margin-bottom: 4px; font-size: 16px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 20px;
    }
    .card h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 8px;
    }
    .cmd-list { list-style: none; }
    .cmd-item {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cmd-item code {
      background: var(--code-bg);
      color: var(--accent);
      padding: 3px 8px;
      border-radius: 4px;
      font-family: "JetBrains Mono", Consolas, Monaco, monospace;
      font-size: 13px;
      width: fit-content;
    }
    .cmd-item span {
      font-size: 13px;
      color: var(--text-muted);
    }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 20px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--card-border); }
    th { color: var(--text-muted); font-weight: 600; }
    .method {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
    }
    .get { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
    .post { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .put { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .delete { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    footer {
      text-align: center;
      margin-top: 32px;
      color: var(--text-muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1>Trade Master Control Center</h1>
        <p>Automated Zerodha Kite Connect Trading &amp; Real-time Telegram Interface</p>
      </div>
      <div>
        ${authed
          ? '<span class="badge badge-success">● Kite Session Active</span>'
          : '<a href="/login" class="btn">🔐 Login with Zerodha</a>'
        }
      </div>
    </header>

    ${alertBox}

    <div class="grid">
      <!-- Card 1: Auth & Status -->
      <div class="card">
        <h2>🔐 Authentication &amp; System</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/login</code>
            <span>Get Kite Connect OAuth authentication URL</span>
          </li>
          <li class="cmd-item">
            <code>/status</code>
            <span>Check live connection, auth state &amp; trading engine status</span>
          </li>
          <li class="cmd-item">
            <code>/help</code>
            <span>View full interactive Telegram command menu</span>
          </li>
        </ul>
      </div>

      <!-- Card 2: Account & Funds -->
      <div class="card">
        <h2>👤 Account &amp; Portfolio</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/profile</code>
            <span>Zerodha account profile, segments &amp; user privileges</span>
          </li>
          <li class="cmd-item">
            <code>/funds</code> or <code>/margins</code>
            <span>Available cash, collateral, debits &amp; net margins</span>
          </li>
          <li class="cmd-item">
            <code>/holdings</code>
            <span>Demat portfolio holdings, invested value &amp; total/day P&amp;L</span>
          </li>
          <li class="cmd-item">
            <code>/positions</code>
            <span>Open intraday (MIS) &amp; overnight (CNC/NRML) positions</span>
          </li>
          <li class="cmd-item">
            <code>/convert_pos &lt;sym&gt; &lt;product&gt; &lt;qty&gt;</code>
            <span>Convert position margin product (MIS ⇄ CNC)</span>
          </li>
          <li class="cmd-item">
            <code>/auctions</code>
            <span>List portfolio holdings currently in auction</span>
          </li>
        </ul>
      </div>

      <!-- Card 3: Market Data -->
      <div class="card">
        <h2>📈 Market Quotes &amp; Ticker</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/ltp &lt;symbols&gt;</code>
            <span>Real-time Last Traded Price (e.g. <code>/ltp INFY, RELIANCE</code>)</span>
          </li>
          <li class="cmd-item">
            <code>/quote &lt;symbols&gt;</code>
            <span>Full market quote: 5-depth, volume, VWAP &amp; circuit limits</span>
          </li>
          <li class="cmd-item">
            <code>/ohlc &lt;symbols&gt;</code>
            <span>Open, High, Low, Close quotes &amp; day change percentage</span>
          </li>
        </ul>
      </div>

      <!-- Card 4: Orders & Alerts -->
      <div class="card">
        <h2>📋 Orders, Trades &amp; Alerts</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/orders</code>
            <span>Today's order book with order ID, status, qty &amp; price</span>
          </li>
          <li class="cmd-item">
            <code>/trades</code>
            <span>Executed trade fills, transaction type &amp; timestamps</span>
          </li>
          <li class="cmd-item">
            <code>/gtt</code>
            <span>Active Good-Till-Triggered (GTT) orders and conditions</span>
          </li>
          <li class="cmd-item">
            <code>/alerts</code>
            <span>View active price and indicator alerts</span>
          </li>
        </ul>
      </div>

      <!-- Card 5: Strategy Rules -->
      <div class="card">
        <h2>⚡ Strategy Rules</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/list_rules</code>
            <span>Display all active algorithmic strategy rules</span>
          </li>
          <li class="cmd-item">
            <code>/set_rule &lt;params&gt;</code>
            <span>Configure PRICE_RANGE, MA_CROSS, or INDEX_OPTION rules</span>
          </li>
          <li class="cmd-item">
            <code>/del_rule &lt;id&gt;</code>
            <span>Delete a strategy rule by its ID</span>
          </li>
        </ul>
      </div>

      <!-- Card 6: Risk Management -->
      <div class="card">
        <h2>🛡️ Risk Management</h2>
        <ul class="cmd-list">
          <li class="cmd-item">
            <code>/view_risk</code>
            <span>View risk limits, max daily loss &amp; kill-switch status</span>
          </li>
          <li class="cmd-item">
            <code>/set_risk &lt;key&gt; &lt;val&gt;</code>
            <span>Update parameters (e.g. <code>/set_risk max_daily_loss 5000</code>)</span>
          </li>
          <li class="cmd-item">
            <code>/kill_switch</code> or <code>/panic</code>
            <span>Emergency liquidation: cancels pending orders &amp; halts trading</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- REST API Endpoints Reference -->
    <div class="table-container">
      <h2 style="margin-bottom: 16px; color: #fff;">🌐 REST API Endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/user/profile</code></td>
            <td>Retrieve authenticated user profile</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/user/margins</code></td>
            <td>Retrieve account funds and margins (Equity &amp; Commodity)</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/portfolio/holdings</code></td>
            <td>Retrieve long-term Demat portfolio holdings</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/portfolio/positions</code></td>
            <td>Retrieve open short-term and intraday positions</td>
          </tr>
          <tr>
            <td><span class="method put">PUT</span></td>
            <td><code>/portfolio/positions</code></td>
            <td>Convert position product type (e.g. MIS to CNC)</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/portfolio/holdings/auctions</code></td>
            <td>Retrieve list of portfolio holdings in auction</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/quote?i=NSE:INFY</code></td>
            <td>Full market quote with depth, volume &amp; VWAP</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/quote/ohlc?i=NSE:INFY</code></td>
            <td>OHLC quotes and day change percentage</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/quote/ltp?i=NSE:INFY</code></td>
            <td>Last Traded Price for instruments</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/orders</code></td>
            <td>Retrieve today's order book</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/trades</code></td>
            <td>Retrieve executed trade fills</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/gtt/triggers</code></td>
            <td>Retrieve list of active GTT triggers</td>
          </tr>
          <tr>
            <td><span class="method post">POST</span></td>
            <td><code>/gtt/triggers</code></td>
            <td>Create a new GTT trigger</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/alerts</code></td>
            <td>Retrieve all configured price alerts</td>
          </tr>
          <tr>
            <td><span class="method get">GET</span></td>
            <td><code>/instruments</code></td>
            <td>Retrieve tradable instruments dump</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer>
      <p>Trade Master • Connected with Zerodha Kite Connect API • Keep session active daily before 07:30 AM IST</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Create and return the Express API router.
 */
export function createApiRouter(): express.Router {
  const router = express.Router();

  // ------------------------------------
  // Dashboard & OAuth Routes
  // ------------------------------------
  router.get('/', (_req: Request, res: Response) => {
    res.send(renderDashboardHtml());
  });

  router.get('/login', (_req: Request, res: Response) => {
    const kite = getKiteInstance();
    const loginUrl = kite.getLoginURL();
    res.redirect(loginUrl);
  });

  router.get('/callback', async (req: Request, res: Response) => {
    const { request_token, status } = req.query as Record<string, string>;

    if (status === 'rejected' || !request_token) {
      res.status(400).send(renderDashboardHtml({
        success: false,
        alertTitle: '❌ Authentication Rejected or Cancelled',
        alertMessage: 'Zerodha login was not completed. Please try logging in again via /login.',
      }));
      return;
    }

    try {
      const kite = getKiteInstance();
      const session = await kite.generateSession(request_token, config.kiteApiSecret);

      writeSession({
        access_token: session.access_token,
        public_token: session.public_token,
        login_time: new Date().toISOString(),
      });

      kite.setAccessToken(session.access_token);

      if (authSuccessCallback) {
        try {
          await authSuccessCallback(session.access_token);
        } catch (subsysErr) {
          console.error('[Auth] Subsystems initialization error:', subsysErr);
        }
      }

      if (telegramNotifyFn) {
        await telegramNotifyFn(
          '✅ <b>Zerodha Authentication Successful!</b>\n' +
          '━━━━━━━━━━━━━━━━━━━━━\n' +
          'Kite Connect session active until 07:30 AM IST.\n\n' +
          '<b>🚀 Quick Commands:</b>\n' +
          '  • <code>/profile</code> — View user profile\n' +
          '  • <code>/funds</code> — Check cash &amp; margins\n' +
          '  • <code>/holdings</code> — View Demat portfolio\n' +
          '  • <code>/positions</code> — View open positions\n' +
          '  • <code>/ltp INFY</code> — Check ticker price\n' +
          '  • <code>/quote RELIANCE</code> — Full quote &amp; depth\n' +
          '  • <code>/orders</code> — Check today\'s order book\n' +
          '  • <code>/list_rules</code> — View active strategies\n' +
          '  • <code>/help</code> — Full command center\n' +
          '━━━━━━━━━━━━━━━━━━━━━',
        );
      }

      res.send(renderDashboardHtml({
        success: true,
        alertTitle: '✅ Zerodha Authentication Successful!',
        alertMessage: 'Your Kite Connect session is active until 07:30 AM IST tomorrow. You can now return to Telegram and start trading or monitoring.',
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Auth] Session generation failed:', message);

      if (telegramNotifyFn) {
        await telegramNotifyFn(`❌ <b>Zerodha Auth Failed</b>\n\nError: ${message}`);
      }

      res.status(500).send(renderDashboardHtml({
        success: false,
        alertTitle: '❌ Authentication Error',
        alertMessage: message,
      }));
    }
  });

  // ------------------------------------
  // User Profile & Margins
  // ------------------------------------
  const handleProfile = async (_req: Request, res: Response) => {
    try {
      const profile = await userManager.getProfile();
      res.json({ status: 'success', data: profile });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/user/profile', requireAuth, handleProfile);
  router.get('/api/user/profile', requireAuth, handleProfile);

  const handleMargins = async (req: Request, res: Response) => {
    try {
      const segment = req.params['segment'];
      const margins = await userManager.getMargins(segment);
      res.json({ status: 'success', data: margins });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/user/margins', requireAuth, handleMargins);
  router.get('/user/margins/:segment', requireAuth, handleMargins);
  router.get('/api/user/margins', requireAuth, handleMargins);
  router.get('/api/user/margins/:segment', requireAuth, handleMargins);

  // ------------------------------------
  // Portfolio (Holdings & Positions)
  // ------------------------------------
  const handleHoldings = async (_req: Request, res: Response) => {
    try {
      const summary = await portfolioManager.getHoldings();
      res.json({ status: 'success', data: summary });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/portfolio/holdings', requireAuth, handleHoldings);
  router.get('/api/portfolio/holdings', requireAuth, handleHoldings);

  const handleAuctions = async (_req: Request, res: Response) => {
    try {
      const auctions = await portfolioManager.getAuctions();
      res.json({ status: 'success', data: auctions });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/portfolio/holdings/auctions', requireAuth, handleAuctions);
  router.get('/api/portfolio/holdings/auctions', requireAuth, handleAuctions);

  const handlePositions = async (_req: Request, res: Response) => {
    try {
      const positions = await portfolioManager.getPositions();
      res.json({ status: 'success', data: positions });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/portfolio/positions', requireAuth, handlePositions);
  router.get('/api/portfolio/positions', requireAuth, handlePositions);

  const handleConvertPosition = async (req: Request, res: Response) => {
    try {
      const params: PositionConversionParams = req.body;
      const success = await portfolioManager.convertPosition(params);
      res.json({ status: 'success', data: { converted: success } });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.put('/portfolio/positions', requireAuth, handleConvertPosition);
  router.put('/api/portfolio/positions', requireAuth, handleConvertPosition);

  // ------------------------------------
  // Market Quotes & LTP
  // ------------------------------------
  const handleLTP = async (req: Request, res: Response) => {
    try {
      const instruments = extractInstruments(req);
      if (instruments.length === 0) {
        res.status(400).json({ status: 'error', message: 'Missing instrument param (?i=NSE:INFY)' });
        return;
      }
      const quotes = await marketDataManager.getLTP(instruments);
      res.json({ status: 'success', data: quotes });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/quote/ltp', requireAuth, handleLTP);
  router.get('/api/quote/ltp', requireAuth, handleLTP);

  const handleOHLC = async (req: Request, res: Response) => {
    try {
      const instruments = extractInstruments(req);
      if (instruments.length === 0) {
        res.status(400).json({ status: 'error', message: 'Missing instrument param (?i=NSE:INFY)' });
        return;
      }
      const quotes = await marketDataManager.getOHLC(instruments);
      res.json({ status: 'success', data: quotes });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/quote/ohlc', requireAuth, handleOHLC);
  router.get('/api/quote/ohlc', requireAuth, handleOHLC);

  const handleQuote = async (req: Request, res: Response) => {
    try {
      const instruments = extractInstruments(req);
      if (instruments.length === 0) {
        res.status(400).json({ status: 'error', message: 'Missing instrument param (?i=NSE:INFY)' });
        return;
      }
      const quotes = await marketDataManager.getQuote(instruments);
      res.json({ status: 'success', data: quotes });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/quote', requireAuth, handleQuote);
  router.get('/api/quote', requireAuth, handleQuote);

  const handleHistorical = async (req: Request, res: Response) => {
    try {
      const token = parseInt(String(req.query['token']), 10);
      const interval = String(req.query['interval'] ?? 'day');
      const from = String(req.query['from']);
      const to = String(req.query['to']);
      if (!token || !from || !to) {
        res.status(400).json({ status: 'error', message: 'Missing required params (token, from, to)' });
        return;
      }
      const continuous = req.query['continuous'] === '1' || req.query['continuous'] === 'true';
      const oi = req.query['oi'] === '1' || req.query['oi'] === 'true';

      const data = await marketDataManager.getHistoricalData(token, interval, from, to, continuous, oi);
      res.json({ status: 'success', data });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/quote/historical', requireAuth, handleHistorical);
  router.get('/api/quote/historical', requireAuth, handleHistorical);

  // ------------------------------------
  // Instruments Dump
  // ------------------------------------
  const handleInstruments = async (req: Request, res: Response) => {
    try {
      const exchange = req.params['exchange'] as Exchange | undefined;
      await instrumentManager.ensureLoaded();
      if (exchange) {
        const list = instrumentManager.getByExchange(exchange);
        res.json({ status: 'success', count: list.length, data: list });
      } else {
        const kite = getKiteInstance();
        const raw = await kite.getInstruments();
        res.json({ status: 'success', count: raw.length, data: raw });
      }
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/instruments', requireAuth, handleInstruments);
  router.get('/instruments/:exchange', requireAuth, handleInstruments);
  router.get('/api/instruments', requireAuth, handleInstruments);
  router.get('/api/instruments/:exchange', requireAuth, handleInstruments);

  // ------------------------------------
  // Orders & Trades
  // ------------------------------------
  const handleOrders = async (_req: Request, res: Response) => {
    try {
      const orders = await orderManager.getOrders();
      res.json({ status: 'success', data: orders });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/orders', requireAuth, handleOrders);
  router.get('/api/orders', requireAuth, handleOrders);

  const handleOrderDetails = async (req: Request, res: Response) => {
    try {
      const orderId = req.params['order_id'];
      if (!orderId) {
        res.status(400).json({ status: 'error', message: 'Missing order_id' });
        return;
      }
      const order = await orderManager.getOrderDetails(orderId);
      res.json({ status: 'success', data: order });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/orders/:order_id', requireAuth, handleOrderDetails);
  router.get('/api/orders/:order_id', requireAuth, handleOrderDetails);

  const handleTrades = async (_req: Request, res: Response) => {
    try {
      const trades = await orderManager.getTrades();
      res.json({ status: 'success', data: trades });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/trades', requireAuth, handleTrades);
  router.get('/api/trades', requireAuth, handleTrades);

  const handleOrderTrades = async (req: Request, res: Response) => {
    try {
      const orderId = req.params['order_id'];
      if (!orderId) {
        res.status(400).json({ status: 'error', message: 'Missing order_id' });
        return;
      }
      const trades = await orderManager.getOrderTrades(orderId);
      res.json({ status: 'success', data: trades });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/orders/:order_id/trades', requireAuth, handleOrderTrades);
  router.get('/api/orders/:order_id/trades', requireAuth, handleOrderTrades);

  // ------------------------------------
  // GTT Triggers
  // ------------------------------------
  const handleGetGTTs = async (_req: Request, res: Response) => {
    try {
      const gtts = await gttManager.getGTTs();
      res.json({ status: 'success', data: gtts });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/gtt/triggers', requireAuth, handleGetGTTs);
  router.get('/api/gtt', requireAuth, handleGetGTTs);

  const handleGetGTT = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params['id'] ?? '', 10);
      const gtt = await gttManager.getGTT(id);
      res.json({ status: 'success', data: gtt });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/gtt/triggers/:id', requireAuth, handleGetGTT);
  router.get('/api/gtt/:id', requireAuth, handleGetGTT);

  const handlePlaceGTT = async (req: Request, res: Response) => {
    try {
      const params: CreateGTTParams = req.body;
      const result = await gttManager.placeGTT(params);
      res.json({ status: 'success', data: result });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.post('/gtt/triggers', requireAuth, handlePlaceGTT);
  router.post('/api/gtt', requireAuth, handlePlaceGTT);

  const handleDeleteGTT = async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params['id'] ?? '', 10);
      const success = await gttManager.deleteGTT(id);
      res.json({ status: 'success', data: { deleted: success } });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.delete('/gtt/triggers/:id', requireAuth, handleDeleteGTT);
  router.delete('/api/gtt/:id', requireAuth, handleDeleteGTT);

  // ------------------------------------
  // Alerts
  // ------------------------------------
  const handleGetAlerts = async (_req: Request, res: Response) => {
    try {
      const alerts = await alertManager.getAlerts();
      res.json({ status: 'success', data: alerts });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/alerts', requireAuth, handleGetAlerts);
  router.get('/api/alerts', requireAuth, handleGetAlerts);

  const handleGetAlert = async (req: Request, res: Response) => {
    try {
      const uuid = req.params['uuid'];
      if (!uuid) {
        res.status(400).json({ status: 'error', message: 'Missing uuid' });
        return;
      }
      const alert = await alertManager.getAlert(uuid);
      res.json({ status: 'success', data: alert });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/alerts/:uuid', requireAuth, handleGetAlert);
  router.get('/api/alerts/:uuid', requireAuth, handleGetAlert);

  const handleCreateAlert = async (req: Request, res: Response) => {
    try {
      const alert = await alertManager.createAlert(req.body);
      res.json({ status: 'success', data: alert });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.post('/alerts', requireAuth, handleCreateAlert);
  router.post('/api/alerts', requireAuth, handleCreateAlert);

  const handleModifyAlert = async (req: Request, res: Response) => {
    try {
      const uuid = req.params['uuid'];
      if (!uuid) {
        res.status(400).json({ status: 'error', message: 'Missing uuid' });
        return;
      }
      const success = await alertManager.modifyAlert(uuid, req.body);
      res.json({ status: 'success', data: { modified: success } });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.put('/alerts/:uuid', requireAuth, handleModifyAlert);
  router.put('/api/alerts/:uuid', requireAuth, handleModifyAlert);

  const handleDeleteAlert = async (req: Request, res: Response) => {
    try {
      const uuid = (req.query['uuid'] as string) || req.params['uuid'];
      if (!uuid) {
        res.status(400).json({ status: 'error', message: 'Missing uuid parameter' });
        return;
      }
      const success = await alertManager.deleteAlert(uuid);
      res.json({ status: 'success', data: { deleted: success } });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.delete('/alerts', requireAuth, handleDeleteAlert);
  router.delete('/alerts/:uuid', requireAuth, handleDeleteAlert);
  router.delete('/api/alerts', requireAuth, handleDeleteAlert);
  router.delete('/api/alerts/:uuid', requireAuth, handleDeleteAlert);

  const handleAlertHistory = async (req: Request, res: Response) => {
    try {
      const uuid = req.params['uuid'];
      if (!uuid) {
        res.status(400).json({ status: 'error', message: 'Missing uuid' });
        return;
      }
      const history = await alertManager.getAlertHistory(uuid);
      res.json({ status: 'success', data: history });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  };
  router.get('/alerts/:uuid/history', requireAuth, handleAlertHistory);
  router.get('/api/alerts/:uuid/history', requireAuth, handleAlertHistory);

  return router;
}

/**
 * Create and start the Express HTTP server.
 */
export function startAuthServer(): void {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(createApiRouter());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      authenticated: isAuthenticated(),
      timestamp: new Date().toISOString(),
    });
  });

  app.listen(config.port, () => {
    console.log(`[Auth] HTTP server running on http://localhost:${config.port}`);
    console.log(`[Auth] Login URL: http://localhost:${config.port}/login`);
  });
}

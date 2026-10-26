// ============================================================
// Trade Master – Comprehensive API & Module Verification Suite
// Tests all modules, Kite Connect API endpoints, and prints a detailed report.
// ============================================================
import 'dotenv/config';
import { config } from '../src/config';
import { getKiteInstance, setAccessToken } from '../src/auth/authServer';
import { restoreSession, isAuthenticated, getAccessToken } from '../src/auth/sessionManager';
import { userManager } from '../src/user/userManager';
import { portfolioManager } from '../src/portfolio/portfolioManager';
import { marketDataManager } from '../src/market/marketDataManager';
import { orderManager } from '../src/orders/orderManager';
import { gttManager } from '../src/orders/gttManager';
import { alertManager } from '../src/alerts/alertManager';
import { instrumentManager } from '../src/instruments/instrumentManager';
import { riskManager } from '../src/risk/riskManager';

interface TestResult {
  module: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  durationMs: number;
  details: string;
}

const results: TestResult[] = [];

async function runTest(
  module: string,
  endpoint: string,
  testFn: () => Promise<string>
): Promise<void> {
  const start = Date.now();
  try {
    const details = await testFn();
    results.push({
      module,
      endpoint,
      status: 'PASS',
      durationMs: Date.now() - start,
      details,
    });
  } catch (err: any) {
    results.push({
      module,
      endpoint,
      status: 'FAIL',
      durationMs: Date.now() - start,
      details: err.message || String(err),
    });
  }
}

async function main(): Promise<void> {
  console.log('============================================================');
  console.log('🧪 TRADE MASTER – COMPREHENSIVE MODULE & API TEST SUITE');
  console.log('============================================================\n');

  console.log('📋 Checking configuration:');
  console.log(`  • Kite API Key: ${config.kiteApiKey ? 'Present (' + config.kiteApiKey.slice(0, 4) + '...)' : 'MISSING'}`);
  console.log(`  • Telegram Bot Token: ${config.telegramBotToken ? 'Present' : 'MISSING'}`);
  console.log(`  • Telegram User ID: ${config.telegramAllowedUserId || 'MISSING'}`);
  console.log(`  • HTTP Port: ${config.port}\n`);

  // Attempt session restore
  const sessionRestored = restoreSession();
  const token = getAccessToken();
  const kite = getKiteInstance();

  if (token) {
    kite.setAccessToken(token);
    userManager.setKite(kite);
    portfolioManager.setKite(kite);
    marketDataManager.setKite(kite);
    orderManager.setKite(kite);
    gttManager.setKite(kite);
    instrumentManager.setKite(kite);
    riskManager.setKite(kite);
  }

  const authenticated = isAuthenticated();
  console.log(`🔐 Authentication Status: ${authenticated ? '✅ Authenticated' : '⚠️ Not Authenticated / Expired'}\n`);

  if (!authenticated) {
    console.log('⚠️ Session is not authenticated or token expired (tokens expire daily at 7:30 AM IST).');
    console.log(`👉 To authenticate, start the bot and visit: http://localhost:${config.port}/login\n`);
  }

  // 1. Risk Manager Test (local module)
  await runTest('RiskManager', 'Local Config & In-Memory Limits', async () => {
    const cfg = riskManager.getConfig();
    return `Max daily loss: ₹${cfg.max_daily_loss}, Max open pos: ${cfg.max_open_positions}, Trading: ${cfg.trading_enabled}`;
  });

  if (!authenticated) {
    // Record skipped API tests
    const skippedEndpoints = [
      ['UserManager', 'GET /user/profile'],
      ['UserManager', 'GET /user/margins'],
      ['PortfolioManager', 'GET /portfolio/holdings'],
      ['PortfolioManager', 'GET /portfolio/positions'],
      ['PortfolioManager', 'GET /portfolio/holdings/auctions'],
      ['MarketDataManager', 'GET /quote/ltp (NSE:INFY, NSE:RELIANCE, NSE:NIFTY 50)'],
      ['MarketDataManager', 'GET /quote/ohlc (NSE:INFY)'],
      ['MarketDataManager', 'GET /quote (NSE:INFY)'],
      ['OrderManager', 'GET /orders'],
      ['OrderManager', 'GET /trades'],
      ['GTTManager', 'GET /gtt/triggers'],
      ['AlertManager', 'GET /alerts'],
      ['InstrumentManager', 'GET /instruments'],
    ];

    for (const [mod, ep] of skippedEndpoints) {
      results.push({
        module: mod,
        endpoint: ep,
        status: 'SKIPPED',
        durationMs: 0,
        details: 'Requires active Zerodha OAuth session (daily token)',
      });
    }
  } else {
    // 2. User Profile API
    await runTest('UserManager', 'GET /user/profile', async () => {
      const p = await userManager.getProfile();
      return `User ID: ${p.user_id}, Name: ${p.user_name}, Broker: ${p.broker}`;
    });

    // 3. User Margins / Funds API
    await runTest('UserManager', 'GET /user/margins', async () => {
      const m = await userManager.getMargins();
      const cash = m.equity?.available?.cash ?? 0;
      return `Equity Cash: ₹${cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    });

    // 4. Portfolio Holdings API
    await runTest('PortfolioManager', 'GET /portfolio/holdings', async () => {
      const h = await portfolioManager.getHoldings();
      return `Holdings Count: ${h.holdings.length}, Total Value: ₹${h.currentValue.toFixed(2)}, P&L: ₹${h.totalPnL.toFixed(2)}`;
    });

    // 5. Portfolio Positions API
    await runTest('PortfolioManager', 'GET /portfolio/positions', async () => {
      const pos = await portfolioManager.getPositions();
      return `Net Positions: ${pos.net.length}, Day Positions: ${pos.day.length}`;
    });

    // 6. Portfolio Auctions API
    await runTest('PortfolioManager', 'GET /portfolio/holdings/auctions', async () => {
      const a = await portfolioManager.getAuctions();
      return `Auctions Count: ${a.length}`;
    });

    // 7. Market LTP API (works on weekends too with last traded prices)
    await runTest('MarketDataManager', 'GET /quote/ltp', async () => {
      const ltp = await marketDataManager.getLTP(['NSE:BAJFINANCE', 'NSE:ITC', 'NSE:INFY']);
      const keys = Object.keys(ltp);
      const summary = keys.map((k) => `${k}: ₹${ltp[k]?.last_price}`).join(', ');
      return summary || 'No LTP received';
    });

    // 8. Market OHLC API
    await runTest('MarketDataManager', 'GET /quote/ohlc', async () => {
      const ohlc = await marketDataManager.getOHLC(['NSE:INFY']);
      const infy = ohlc['NSE:INFY'];
      return `INFY Close: ₹${infy?.ohlc?.close}, LTP: ₹${infy?.last_price}`;
    });

    // 9. Full Quote API
    await runTest('MarketDataManager', 'GET /quote', async () => {
      const quotes = await marketDataManager.getQuote(['NSE:INFY']);
      const infy = quotes['NSE:INFY'];
      return `INFY Volume: ${infy?.volume}, High: ₹${infy?.ohlc?.high}, Low: ₹${infy?.ohlc?.low}`;
    });

    // 10. Orders Book API
    await runTest('OrderManager', 'GET /orders', async () => {
      const orders = await orderManager.getOrders();
      return `Orders Count: ${orders.length}`;
    });

    // 11. Trades API
    await runTest('OrderManager', 'GET /trades', async () => {
      const trades = await orderManager.getTrades();
      return `Trades Count: ${trades.length}`;
    });

    // 12. GTT API
    await runTest('GTTManager', 'GET /gtt/triggers', async () => {
      const gtts = await gttManager.getGTTs();
      return `GTT Triggers Count: ${gtts.length}`;
    });

    // 13. Alerts API
    await runTest('AlertManager', 'GET /alerts', async () => {
      const alerts = await alertManager.getAlerts();
      return `Alerts Count: ${alerts.length}`;
    });

    // 14. Instrument Master API
    await runTest('InstrumentManager', 'GET /instruments', async () => {
      await instrumentManager.ensureLoaded();
      const nse = instrumentManager.getByExchange('NSE');
      return `Loaded NSE Instruments: ${nse.length}`;
    });
  }

  // Print results table
  console.log('\n============================================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('============================================================');
  console.log(
    'Status'.padEnd(8) +
    'Module'.padEnd(20) +
    'Endpoint'.padEnd(35) +
    'Time'.padEnd(10) +
    'Details'
  );
  console.log('-'.repeat(100));

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : '⚪ SKIP';
    console.log(
      icon.padEnd(8) +
      r.module.padEnd(20) +
      r.endpoint.padEnd(35) +
      `${r.durationMs}ms`.padEnd(10) +
      r.details
    );
  }
  console.log('============================================================\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;

  console.log(`Summary: ${passed} Passed, ${failed} Failed, ${skipped} Skipped (${results.length} total tests)\n`);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

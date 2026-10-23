// ============================================================
// Trade Master – Main Orchestration Entry Point
// Wires together all modules and starts the system.
// ============================================================
import 'dotenv/config';
import cron from 'node-cron';

import { config } from './config';
import { startAuthServer, getKiteInstance, registerTelegramNotifier, registerAuthSuccessHandler } from './auth/authServer';
import { restoreSession, isAuthenticated } from './auth/sessionManager';
import { instrumentManager } from './instruments/instrumentManager';
import { tickerClient } from './engine/ticker';
import { candleAggregator } from './engine/candleAggregator';
import { indicatorEngine } from './engine/indicatorEngine';
import { riskManager } from './risk/riskManager';
import { orderManager } from './orders/orderManager';
import { telegramBot } from './bot/bot';
import { readConfig } from './storage/storage';
import type { StrategiesConfig, Rule, PriceRangeRule, MACrossRule, IndexOptionRule, TradingSignal, Timeframe } from './types';

// Map of instrument_token => list of rules that watch it
const tokenToRules: Map<number, Rule[]> = new Map();

// Track recently fired rule IDs to prevent spam (simple cooldown)
const recentlyFired: Map<string, number> = new Map();
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown per rule

/**
 * Build the token → rule map from current strategies.json.
 * Subscribe new tokens via WebSocket.
 */
async function syncStrategySubscriptions(): Promise<void> {
  if (!isAuthenticated()) return;

  const { rules } = readConfig<StrategiesConfig>('strategies.json');
  tokenToRules.clear();

  const kite = getKiteInstance();
  instrumentManager.setKite(kite);
  await instrumentManager.ensureLoaded();

  const tokensNeeded = new Set<number>();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let token: number | null = null;

    if (rule.type === 'PRICE_RANGE' || rule.type === 'MA_CROSS') {
      const typedRule = rule as PriceRangeRule | MACrossRule;
      const instrument = instrumentManager.findBySymbol(typedRule.symbol, typedRule.exchange);
      if (!instrument) {
        console.warn(`[Index] Instrument not found for rule ${rule.id}: ${typedRule.symbol}`);
        continue;
      }
      token = instrument.instrument_token;
    } else if (rule.type === 'INDEX_OPTION') {
      const typedRule = rule as IndexOptionRule;
      // For INDEX_OPTION, subscribe to the underlying index spot
      const spotSymbols: Record<string, { symbol: string; exchange: 'NSE' | 'BSE' }> = {
        NIFTY: { symbol: 'NIFTY 50', exchange: 'NSE' },
        BANKNIFTY: { symbol: 'NIFTY BANK', exchange: 'NSE' },
      };
      const spotInfo = spotSymbols[typedRule.underlying];
      if (spotInfo) {
        const instrument = instrumentManager.findBySymbol(spotInfo.symbol, spotInfo.exchange);
        if (instrument) token = instrument.instrument_token;
      }
    }

    if (token !== null) {
      tokensNeeded.add(token);
      if (!tokenToRules.has(token)) tokenToRules.set(token, []);
      tokenToRules.get(token)!.push(rule);
    }
  }

  // Subscribe to all required tokens
  if (tokensNeeded.size > 0) {
    tickerClient.subscribe(Array.from(tokensNeeded));
    console.log(`[Index] Subscribed to ${tokensNeeded.size} instrument token(s).`);
  }
}

/**
 * Dispatch a trading signal via Telegram.
 * Includes cooldown and risk check.
 */
async function dispatchSignal(ruleId: string, rule: Rule, price: number, token: number): Promise<void> {
  // Cooldown check
  const lastFired = recentlyFired.get(ruleId);
  if (lastFired && Date.now() - lastFired < SIGNAL_COOLDOWN_MS) {
    console.log(`[Index] Signal for rule ${ruleId} suppressed (cooldown active).`);
    return;
  }

  // Determine tradingsymbol and exchange
  let tradingsymbol = '';
  let exchange = 'NSE';

  if (rule.type === 'PRICE_RANGE' || rule.type === 'MA_CROSS') {
    const typedRule = rule as PriceRangeRule | MACrossRule;
    tradingsymbol = typedRule.symbol;
    exchange = typedRule.exchange;
  } else if (rule.type === 'INDEX_OPTION') {
    const typedRule = rule as IndexOptionRule;
    const contract = instrumentManager.getOptionContract({
      underlying: typedRule.underlying,
      expiryType: typedRule.expiryType,
      strikeOffset: typedRule.strikeOffset,
      optionType: typedRule.optionType,
      spotPrice: price,
    });

    if (!contract) {
      await telegramBot.notify(
        `⚠️ *Signal Blocked*\n\nRule #${rule.id}: Could not resolve option contract for ${typedRule.underlying} ${typedRule.strikeOffset} ${typedRule.optionType}`,
      );
      return;
    }

    tradingsymbol = contract.tradingsymbol;
    exchange = 'NFO';
    token = contract.instrument_token;
    price = indicatorEngine.getLatestPrice(token) ?? contract.last_price;
  }

  const estimatedMargin = await orderManager.estimateMargin(price, rule.qty);

  const signal: TradingSignal = {
    id: `${ruleId}_${Date.now()}`,
    ruleId,
    ruleName: `${rule.type} Rule`,
    tradingsymbol,
    exchange: exchange as TradingSignal['exchange'],
    action: rule.action,
    orderType: 'MARKET',
    product: rule.product,
    qty: rule.qty,
    currentPrice: price,
    estimatedMargin,
    timestamp: new Date(),
    instrumentToken: token,
  };

  // Risk check
  const riskCheck = await riskManager.checkSignal(signal);
  if (!riskCheck.allowed) {
    await telegramBot.notify(
      `🚫 *Signal Blocked by Risk Manager*\n\n` +
      `Rule: #${ruleId} — ${tradingsymbol}\n` +
      `Reason: ${riskCheck.reason}`,
    );
    return;
  }

  // Mark as fired (for cooldown)
  recentlyFired.set(ruleId, Date.now());

  // Dispatch to Telegram
  await telegramBot.dispatchSignal(signal);
}

/**
 * Setup cron jobs for daily tasks.
 */
function setupCronJobs(): void {
  // 8:30 AM IST daily — refresh instrument master
  // IST = UTC+5:30, so 8:30 IST = 03:00 UTC
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Refreshing instrument master...');
    try {
      await instrumentManager.fetchInstruments();
      await syncStrategySubscriptions();
      await telegramBot.notify('📊 Instrument master refreshed (8:30 AM IST).');
    } catch (err) {
      console.error('[Cron] Instrument refresh failed:', err);
    }
  });

  // 8:45 AM IST daily — send login reminder if not authenticated
  // 8:45 IST = 03:15 UTC
  cron.schedule('15 3 * * *', async () => {
    if (!isAuthenticated()) {
      const loginUrl = `http://localhost:${config.port}/login`;
      await telegramBot.notify(
        `🔐 *Daily Login Reminder*\n\n` +
        `Your Zerodha access token needs to be renewed.\n\n` +
        `Login URL: ${loginUrl}`,
      );
    }
  });

  // Every minute: re-sync rule subscriptions (picks up new rules added via Telegram)
  cron.schedule('* * * * *', async () => {
    await syncStrategySubscriptions();
  });

  console.log('[Cron] Scheduled jobs configured.');
}

/**
 * Wire up the engine: ticks → candles → indicators → signals.
 */
function setupEngineCallbacks(): void {
  // Route incoming ticks to candle aggregator and price-range evaluator
  tickerClient.onTick((ticks) => {
    for (const tick of ticks) {
      // Update indicator engine prices
      indicatorEngine.updateLatestPrice(tick);

      // Evaluate PRICE_RANGE rules on tick
      indicatorEngine.evaluatePriceRulesOnTick(tick, tokenToRules);
    }

    // Aggregate all ticks into candles
    candleAggregator.processTicks(ticks);
  });

  // When a candle closes, evaluate bar-based rules
  candleAggregator.onBarClosed((bar) => {
    indicatorEngine.evaluateRulesOnBar(bar, tokenToRules);
  });

  // When a signal is emitted, find the rule and dispatch
  indicatorEngine.onSignal(async (event) => {
    console.log(`[Engine] Signal triggered for rule ${event.ruleId}: ${event.reason}`);

    // Find the rule
    let matchedRule: Rule | undefined;
    let matchedToken: number | undefined;

    for (const [token, rules] of tokenToRules.entries()) {
      const r = rules.find((rule) => rule.id === event.ruleId);
      if (r) {
        matchedRule = r;
        matchedToken = token;
        break;
      }
    }

    if (!matchedRule || matchedToken === undefined) {
      console.warn(`[Engine] Rule ${event.ruleId} not found in token map.`);
      return;
    }

    const price = event.lastPrice ?? indicatorEngine.getLatestPrice(matchedToken) ?? 0;
    await dispatchSignal(event.ruleId, matchedRule, price, matchedToken);
  });
}

/**
 * Initialize all trading subsystems once authenticated with a valid access token.
 */
async function initializeSubsystems(accessToken: string): Promise<void> {
  const kite = getKiteInstance();

  // Wire kite instance into subsystems
  riskManager.setKite(kite);
  orderManager.setKite(kite);
  instrumentManager.setKite(kite);

  // Fetch instruments and sync subscriptions
  try {
    await instrumentManager.fetchInstruments();
    await syncStrategySubscriptions();
  } catch (err) {
    console.error('[Index] Failed to fetch instruments:', err);
    await telegramBot.notify('⚠️ Failed to fetch instrument master. Will retry at 8:30 AM IST.');
  }

  // Initialize and connect KiteTicker
  tickerClient.setTelegramAlertFn((msg) => telegramBot.notify(msg));
  tickerClient.initialize(config.kiteApiKey, accessToken);
  tickerClient.connect();

  console.log('[Index] All subsystems initialized.');
  await telegramBot.notify('✅ *Trade Master Online*\n\nSubsystems initialized and WebSocket connected.');
}

/**
 * Main application bootstrap.
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Trade Master...');
  console.log(`[Config] Port: ${config.port} | Signal Timeout: ${config.signalTimeoutSeconds}s`);

  // 1. Start Express OAuth server
  startAuthServer();

  // 2. Start Telegram bot (long polling)
  await telegramBot.launch();

  // 3. Register Telegram notifier and auth success handler
  registerTelegramNotifier((msg) => telegramBot.notify(msg));
  registerAuthSuccessHandler(async (token) => {
    console.log('[Index] New authentication received via OAuth callback.');
    await initializeSubsystems(token);
  });

  // 4. Attempt to restore today's session (if fresh)
  const sessionRestored = restoreSession();

  // 5. If authenticated, initialize subsystems
  if (sessionRestored) {
    const kite = getKiteInstance();
    await initializeSubsystems(kite.access_token ?? '');
  } else {
    console.log('[Index] No valid session. Please authenticate via Telegram /login or browser.');
    await telegramBot.notify(
      '⚠️ *Trade Master Started — Authentication Required*\n\n' +
      `Please login at: http://localhost:${config.port}/login\n\n` +
      'The engine will activate automatically after authentication.',
    );
  }

  // 6. Setup engine callbacks
  setupEngineCallbacks();

  // 7. Setup cron jobs
  setupCronJobs();

  // 8. Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Index] Received ${signal}. Shutting down gracefully...`);
    tickerClient.disconnect();
    await telegramBot.stop(signal);
    console.log('[Index] Trade Master stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log('✅ Trade Master is running. Awaiting market data and commands...');
}

// Run
main().catch((err) => {
  console.error('💥 Fatal startup error:', err);
  process.exit(1);
});

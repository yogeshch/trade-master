// ============================================================
// Trade Master – Telegram Bot (Telegraf)
// Main bot setup, middleware, command registration, and
// signal dispatch with inline keyboard handling.
// ============================================================
import { Telegraf, Context, Markup } from 'telegraf';
import { config } from '../config';
import type { TradingSignal } from '../types';
import { buildSignalKeyboard } from './keyboards';
import {
  formatSignalCard,
  formatSignalExecuted,
  formatSignalDismissed,
  formatSignalExpired,
  formatUserProfile,
  formatMargins,
  formatHoldings,
  formatLTP,
  formatOHLC,
  formatQuote,
  formatOrders,
  formatTrades,
  formatGTTs,
  formatAlerts,
  formatAuctions,
  formatHelpMenu,
  escapeHTML,
} from './formatters';
import { handleSetRule, handleWizardCallback, handleWizardText } from './commands/setRule';
import { handleListRules } from './commands/listRules';
import { handleDelRule } from './commands/delRule';
import { handleViewRisk, handleSetRisk } from './commands/riskCommands';
import { handleKillSwitch } from './commands/killSwitch';
import { orderManager } from '../orders/orderManager';
import { virtualOrderManager } from '../orders/virtualOrderManager';
import { riskManager } from '../risk/riskManager';
import { userManager } from '../user/userManager';
import { portfolioManager } from '../portfolio/portfolioManager';
import { marketDataManager } from '../market/marketDataManager';
import { gttManager } from '../orders/gttManager';
import { alertManager } from '../alerts/alertManager';
import { isAuthenticated, restoreSession } from '../auth/sessionManager';

/** Active pending signals awaiting user response. */
interface PendingSignal {
  signal: TradingSignal;
  messageId: number;
  timeoutHandle: NodeJS.Timeout;
}

/** Prepend 'Mode: Virtual' in front of every bot message when Virtual Mode is active */
function applyModePrefix(text: string): string {
  if (riskManager.isVirtualTrading()) {
    if (!text.includes('Mode: Virtual')) {
      return `Mode: Virtual\n━━━━━━━━━━━━━━━━━━━━━\n${text}`;
    }
  }
  return text;
}

/** Helper to send HTML reply with plain-text fallback on parse error */
async function replySafe(ctx: Context, text: string, extra?: any): Promise<void> {
  const finalText = applyModePrefix(text);
  try {
    await ctx.reply(finalText, { parse_mode: 'HTML', ...(extra || {}) });
  } catch (err) {
    console.warn('[Bot] HTML reply failed, falling back to plain text:', err);
    try {
      await ctx.reply(finalText.replace(/<[^>]*>/g, ''), extra);
    } catch (fallbackErr) {
      console.error('[Bot] Failed to send reply:', fallbackErr);
    }
  }
}

/** Check and auto-restore session from disk if needed */
function ensureAuth(): boolean {
  if (!isAuthenticated()) {
    restoreSession();
  }
  return isAuthenticated();
}

class TelegramBot {
  private bot: Telegraf;
  private pendingSignals: Map<string, PendingSignal> = new Map();

  constructor() {
    this.bot = new Telegraf(config.telegramBotToken);
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  /** Middleware: whitelist check for allowed user. */
  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (userId !== config.telegramAllowedUserId) {
        console.warn(`[Bot] Unauthorized access attempt from user: ${userId}`);
        return; // Silently ignore unauthorized users
      }
      return next();
    });
  }

  /** Register all bot commands. */
  private setupCommands(): void {
    this.bot.start((ctx) => {
      void replySafe(ctx, formatHelpMenu());
    });

    this.bot.help((ctx) => {
      void replySafe(ctx, formatHelpMenu());
    });

    this.bot.command('login', async (ctx) => {
      if (ensureAuth()) {
        await replySafe(ctx, '✅ Already authenticated for today. Session is active.');
        return;
      }
      const loginUrl = `http://localhost:${config.port}/login`;
      await replySafe(
        ctx,
        `🔐 <b>Zerodha Login Required</b>\n\nClick the link below to authenticate:\n${loginUrl}\n\n` +
        `<i>Note: Access tokens expire daily. You must re-login each trading day.</i>`,
      );
    });

    // --- Trading Execution Mode (Live vs Virtual) ---
    this.bot.command('mode', async (ctx) => {
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const parts = text.split(/\s+/).slice(1);
      const arg = parts[0]?.toLowerCase();

      if (arg === 'live') {
        riskManager.setVirtualTrading(false);
        await replySafe(
          ctx,
          `🟢 <b>TRADING MODE: LIVE (Real Capital)</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ Real order execution active. Live funds will be used on Zerodha Kite Connect.`,
        );
        return;
      }

      if (arg === 'virtual' || arg === 'paper') {
        riskManager.setVirtualTrading(true);
        await replySafe(
          ctx,
          `🟡 <b>TRADING MODE: VIRTUAL (Paper Trading)</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `Simulated order execution active. No real funds will be risked. Automated SL (-2%) and Target (+5%) will be simulated on live market ticks.`,
        );
        return;
      }

      const isVirtual = riskManager.isVirtualTrading();
      const statusText = isVirtual
        ? `🟡 <b>Active: VIRTUAL (Paper Trading)</b>\n\nAll signals and orders are simulated safely. No real capital at risk.`
        : `🟢 <b>Active: LIVE (Real Capital)</b>\n\nOrders are placed on your live Zerodha trading account.`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🟡 Switch to VIRTUAL', 'MODE_SET_VIRTUAL'),
          Markup.button.callback('🟢 Switch to LIVE', 'MODE_SET_LIVE'),
        ],
      ]);

      await replySafe(
        ctx,
        `🖥️ <b>Trading Execution Mode</b>\n━━━━━━━━━━━━━━━━━━━━━\n${statusText}`,
        keyboard,
      );
    });

    // --- Profile & Account ---
    this.bot.command('profile', async (ctx) => {
      console.log(`[Bot] /profile called by user: ${ctx.from?.id}`);
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Please login first with <code>/login</code>.');
        return;
      }
      try {
        const profile = await userManager.getProfile();
        console.log(`[Bot] /profile resolved: ${profile.user_id} (${profile.user_name})`);
        await replySafe(ctx, formatUserProfile(profile));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Bot] /profile error:', message);
        await replySafe(ctx, `❌ Failed to fetch user profile: ${escapeHTML(message)}`);
      }
    });

    // --- Funds & Margins ---
    const handleFunds = async (ctx: Context) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Please login first with <code>/login</code>.');
        return;
      }
      try {
        const margins = await userManager.getMargins();
        await replySafe(ctx, formatMargins(margins));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch margins: ${escapeHTML(message)}`);
      }
    };
    this.bot.command('funds', handleFunds);
    this.bot.command('margins', handleFunds);

    // --- Holdings ---
    this.bot.command('holdings', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Please login first with <code>/login</code>.');
        return;
      }
      try {
        const summary = await portfolioManager.getHoldings();
        await replySafe(ctx, formatHoldings(summary));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch holdings: ${escapeHTML(message)}`);
      }
    });

    // --- Positions (Handles Virtual & Live) ---
    this.bot.command('positions', async (ctx) => {
      if (riskManager.isVirtualTrading()) {
        const virtualSummary = virtualOrderManager.formatVirtualSummary();
        await replySafe(ctx, virtualSummary);
        return;
      }

      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Please login first with <code>/login</code>.');
        return;
      }
      try {
        const { net } = await portfolioManager.getPositions();
        const open = net.filter((p) => p.quantity !== 0);
        await replySafe(
          ctx,
          `📊 <b>Open Positions (${open.length})</b>\n\n` + orderManager.formatPositionSummary(open),
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch positions: ${escapeHTML(message)}`);
      }
    });

    // --- Position Conversion ---
    this.bot.command('convert_pos', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const parts = text.split(/\s+/).slice(1);
      if (parts.length < 3) {
        await replySafe(
          ctx,
          `ℹ️ <b>Usage:</b> <code>/convert_pos &lt;symbol&gt; &lt;new_product&gt; &lt;qty&gt; [old_product] [exchange]</code>\n\n` +
          `Example: <code>/convert_pos INFY CNC 10 MIS NSE</code>\n` +
          `Converts 10 shares of INFY from MIS to CNC.`,
        );
        return;
      }

      const [symbol, newProduct, qtyStr, oldProduct = 'MIS', exchange = 'NSE'] = parts;
      const quantity = parseInt(qtyStr, 10);
      if (isNaN(quantity) || quantity <= 0) {
        await replySafe(ctx, '❌ Invalid quantity specified.');
        return;
      }

      try {
        await portfolioManager.convertPosition({
          exchange,
          tradingsymbol: symbol.toUpperCase(),
          transaction_type: 'BUY',
          position_type: 'day',
          quantity,
          old_product: oldProduct.toUpperCase(),
          new_product: newProduct.toUpperCase(),
        });
        await replySafe(
          ctx,
          `✅ <b>Position Converted Successfully</b>\n\n` +
          `Symbol: <code>${escapeHTML(symbol)}</code>\n` +
          `Qty: <code>${quantity}</code>\n` +
          `Product: <code>${oldProduct} ➔ ${newProduct}</code>`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Position conversion failed: ${escapeHTML(message)}`);
      }
    });

    // --- Auctions ---
    this.bot.command('auctions', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      try {
        const auctions = await portfolioManager.getAuctions();
        await replySafe(ctx, formatAuctions(auctions));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch auctions: ${escapeHTML(message)}`);
      }
    });

    // --- Market LTP ---
    this.bot.command('ltp', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const symbolsStr = text.replace(/^\/ltp(@\w+)?\s*/, '').trim();
      if (!symbolsStr) {
        await replySafe(
          ctx,
          `ℹ️ <b>Usage:</b> <code>/ltp &lt;symbol&gt;</code>\n\n` +
          `Examples:\n` +
          `• <code>/ltp INFY</code>\n` +
          `• <code>/ltp RELIANCE, TCS, NIFTY 50</code>`,
        );
        return;
      }

      const symbols = symbolsStr.split(/[\s,]+/).filter(Boolean);
      try {
        const quotes = await marketDataManager.getLTP(symbols);
        await replySafe(ctx, formatLTP(quotes));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch LTP: ${escapeHTML(message)}`);
      }
    });

    // --- Market Full Quote ---
    this.bot.command('quote', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const symbolsStr = text.replace(/^\/quote(@\w+)?\s*/, '').trim();
      if (!symbolsStr) {
        await replySafe(
          ctx,
          `ℹ️ <b>Usage:</b> <code>/quote &lt;symbol&gt;</code>\n\n` +
          `Examples:\n` +
          `• <code>/quote RELIANCE</code>\n` +
          `• <code>/quote NSE:NIFTY 50</code>`,
        );
        return;
      }

      const symbols = symbolsStr.split(/[\s,]+/).filter(Boolean);
      try {
        const quotes = await marketDataManager.getQuote(symbols);
        await replySafe(ctx, formatQuote(quotes));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch quote: ${escapeHTML(message)}`);
      }
    });

    // --- Market OHLC ---
    this.bot.command('ohlc', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const symbolsStr = text.replace(/^\/ohlc(@\w+)?\s*/, '').trim();
      if (!symbolsStr) {
        await replySafe(
          ctx,
          `ℹ️ <b>Usage:</b> <code>/ohlc &lt;symbol&gt;</code>\n\n` +
          `Examples:\n` +
          `• <code>/ohlc INFY</code>\n` +
          `• <code>/ohlc NIFTY 50, BANKNIFTY</code>`,
        );
        return;
      }

      const symbols = symbolsStr.split(/[\s,]+/).filter(Boolean);
      try {
        const quotes = await marketDataManager.getOHLC(symbols);
        await replySafe(ctx, formatOHLC(quotes));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch OHLC: ${escapeHTML(message)}`);
      }
    });

    // --- Orders Book ---
    this.bot.command('orders', async (ctx) => {
      try {
        const orders = await orderManager.getOrders();
        await replySafe(ctx, formatOrders(orders));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch orders: ${escapeHTML(message)}`);
      }
    });

    // --- Trades ---
    this.bot.command('trades', async (ctx) => {
      try {
        const trades = await orderManager.getTrades();
        await replySafe(ctx, formatTrades(trades));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch trades: ${escapeHTML(message)}`);
      }
    });

    // --- GTT Triggers ---
    this.bot.command('gtt', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      try {
        const gtts = await gttManager.getGTTs();
        await replySafe(ctx, formatGTTs(gtts));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch GTT triggers: ${escapeHTML(message)}`);
      }
    });

    // --- Price Alerts ---
    this.bot.command('alerts', async (ctx) => {
      if (!ensureAuth()) {
        await replySafe(ctx, '❌ Not authenticated. Use /login first.');
        return;
      }
      try {
        const alerts = await alertManager.getAlerts();
        await replySafe(ctx, formatAlerts(alerts));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await replySafe(ctx, `❌ Failed to fetch alerts: ${escapeHTML(message)}`);
      }
    });

    // --- Strategy Rules & Risk Management ---
    this.bot.command('list_rules', (ctx) => void handleListRules(ctx));
    this.bot.command('set_rule', (ctx) => void handleSetRule(ctx));
    this.bot.command('del_rule', (ctx) => void handleDelRule(ctx));
    this.bot.command('view_risk', (ctx) => void handleViewRisk(ctx));
    this.bot.command('set_risk', (ctx) => void handleSetRisk(ctx));
    this.bot.command('kill_switch', (ctx) => void handleKillSwitch(ctx));
    this.bot.command('panic', (ctx) => void handleKillSwitch(ctx));

    this.bot.command('status', async (ctx) => {
      const authStatus = ensureAuth() ? '🟢 Authenticated' : '🔴 Not Authenticated';
      const riskCfg = riskManager.getConfig();
      const tradingStatus = riskCfg.trading_enabled ? '🟢 Active' : '🔴 Disabled';
      const modeText = riskManager.isVirtualTrading() ? '🟡 Virtual (Paper Trading)' : '🟢 Live (Real Capital)';

      await replySafe(
        ctx,
        `🖥️ <b>System Status</b>\n\n` +
        `Mode: <b>${modeText}</b>\n` +
        `Auth: ${authStatus}\n` +
        `Trading: ${tradingStatus}\n` +
        `Signal Timeout: <code>${config.signalTimeoutSeconds}s</code>\n` +
        `HTTP Port: <code>${config.port}</code>\n`,
      );
    });

    // Unhandled commands or text fallback (also routes to active wizard)
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text.trim();

      // Check if interactive rule creation wizard intercepts this input
      const handledByWizard = await handleWizardText(ctx, text);
      if (handledByWizard) return;

      if (text.startsWith('/')) {
        const cmd = text.split(/\s+/)[0];
        await replySafe(
          ctx,
          `❓ <b>Unknown command:</b> <code>${escapeHTML(cmd)}</code>\n\n` +
          `Type <code>/help</code> to see all available commands.`,
        );
      } else {
        await replySafe(ctx, formatHelpMenu());
      }
    });
  }

  /** Setup inline keyboard callback handlers. */
  private setupCallbacks(): void {
    this.bot.on('callback_query', async (ctx) => {
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

      const data = ctx.callbackQuery.data;
      if (!data) return;

      // Acknowledge immediately to prevent loading spinner
      await ctx.answerCbQuery();

      // Mode switching callbacks
      if (data === 'MODE_SET_VIRTUAL') {
        riskManager.setVirtualTrading(true);
        await ctx.editMessageText(
          applyModePrefix(
            `🟡 <b>TRADING MODE: VIRTUAL (Paper Trading)</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
            `Simulated order execution active. No real funds will be risked. Automated SL (-2%) and Target (+5%) will be simulated on live ticks.`,
          ),
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (data === 'MODE_SET_LIVE') {
        riskManager.setVirtualTrading(false);
        await ctx.editMessageText(
          `🟢 <b>TRADING MODE: LIVE (Real Capital)</b>\n━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚠️ Real order execution active. Live funds will be used on Zerodha Kite Connect.`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      // Rule Creation Wizard Callbacks
      if (data.startsWith('WIZ_')) {
        const handled = await handleWizardCallback(ctx, data);
        if (handled) return;
      }

      // Signal Execution Callbacks
      if (data.startsWith('EXECUTE_')) {
        const signalId = data.replace('EXECUTE_', '');
        await this.handleExecute(ctx, signalId);
      } else if (data.startsWith('DISMISS_')) {
        const signalId = data.replace('DISMISS_', '');
        await this.handleDismiss(ctx, signalId);
      }
    });
  }

  /** Handle signal execution. */
  private async handleExecute(ctx: Context, signalId: string): Promise<void> {
    const pending = this.pendingSignals.get(signalId);
    if (!pending) {
      await ctx.editMessageText('⚠️ Signal no longer active (already processed or expired).');
      return;
    }

    clearTimeout(pending.timeoutHandle);
    this.pendingSignals.delete(signalId);

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    const { signal } = pending;

    const riskCheck = await riskManager.checkSignal(signal);
    if (!riskCheck.allowed) {
      await ctx.editMessageText(
        applyModePrefix(
          `🚫 <b>Order Blocked by Risk Manager</b>\n\nReason: ${escapeHTML(riskCheck.reason ?? 'Risk limit exceeded')}`,
        ),
        { parse_mode: 'HTML' },
      );
      return;
    }

    const isVirtual = riskManager.isVirtualTrading();
    const result = await orderManager.placeOrder(
      {
        tradingsymbol: signal.tradingsymbol,
        exchange: signal.exchange,
        transaction_type: signal.action,
        quantity: signal.qty,
        order_type: 'MARKET',
        product: signal.product,
        variety: 'regular',
      },
      signal,
    );

    if (result.success && result.orderId) {
      await ctx.editMessageText(applyModePrefix(formatSignalExecuted(signal, result.orderId, isVirtual)), {
        parse_mode: 'HTML',
      });
    } else {
      await ctx.editMessageText(
        applyModePrefix(
          `❌ <b>Order Failed</b>\n\nError: ${escapeHTML(result.error ?? 'Unknown error')}\n\nPlease check your positions manually.`,
        ),
        { parse_mode: 'HTML' },
      );
    }
  }

  /** Handle signal dismissal. */
  private async handleDismiss(ctx: Context, signalId: string): Promise<void> {
    const pending = this.pendingSignals.get(signalId);
    if (!pending) {
      await ctx.editMessageText('⚠️ Signal no longer active.');
      return;
    }

    clearTimeout(pending.timeoutHandle);
    this.pendingSignals.delete(signalId);

    await ctx.editMessageText(applyModePrefix(formatSignalDismissed(pending.signal)), {
      parse_mode: 'HTML',
    });
  }

  /**
   * Dispatch a trading signal card to the user.
   */
  async dispatchSignal(signal: TradingSignal): Promise<void> {
    const card = applyModePrefix(formatSignalCard(signal));
    const keyboard = buildSignalKeyboard(signal.id);

    try {
      const sent = await this.bot.telegram.sendMessage(
        config.telegramAllowedUserId,
        card,
        { parse_mode: 'HTML', ...keyboard },
      );

      const timeoutHandle = setTimeout(() => {
        void this.expireSignal(signal, sent.message_id);
      }, config.signalTimeoutSeconds * 1000);

      this.pendingSignals.set(signal.id, {
        signal,
        messageId: sent.message_id,
        timeoutHandle,
      });
    } catch (err: unknown) {
      console.error('[Bot] Failed to dispatch signal:', err);
    }
  }

  /** Expire a signal after timeout. */
  private async expireSignal(signal: TradingSignal, messageId: number): Promise<void> {
    if (!this.pendingSignals.has(signal.id)) return;

    this.pendingSignals.delete(signal.id);

    try {
      await this.bot.telegram.editMessageText(
        config.telegramAllowedUserId,
        messageId,
        undefined,
        applyModePrefix(formatSignalExpired(signal, config.signalTimeoutSeconds)),
        { parse_mode: 'HTML' },
      );
    } catch (err) {
      console.warn('[Bot] Could not edit expired signal message:', err);
    }
  }

  /**
   * Send a plain notification message to the configured user.
   */
  async notify(message: string): Promise<void> {
    const finalMsg = applyModePrefix(message);
    try {
      await this.bot.telegram.sendMessage(config.telegramAllowedUserId, finalMsg, {
        parse_mode: 'HTML',
      });
    } catch (err: unknown) {
      console.warn('[Bot] HTML notification failed, falling back to plain text:', err);
      try {
        await this.bot.telegram.sendMessage(
          config.telegramAllowedUserId,
          finalMsg.replace(/<[^>]*>/g, ''),
        );
      } catch (fallbackErr) {
        console.error('[Bot] Failed to send notification:', fallbackErr);
      }
    }
  }

  /** Start the bot (long polling). */
  async launch(): Promise<void> {
    console.log('[Bot] Starting Telegram bot (long polling)...');

    try {
      await this.bot.telegram.setMyCommands([
        { command: 'help', description: 'Show all bot commands and interactive guide' },
        { command: 'mode', description: 'Toggle between Virtual (Paper) & Live trading' },
        { command: 'set_rule', description: 'Interactive strategy rule creation wizard' },
        { command: 'list_rules', description: 'List active strategy rules' },
        { command: 'del_rule', description: 'Delete strategy rule by ID' },
        { command: 'positions', description: 'View open positions (Virtual & Live)' },
        { command: 'orders', description: 'View today\'s order book and status' },
        { command: 'trades', description: 'View executed trades and fill details' },
        { command: 'funds', description: 'Check cash and margin balances' },
        { command: 'holdings', description: 'View Demat portfolio holdings and P&L' },
        { command: 'ltp', description: 'Get Last Traded Price (e.g. /ltp INFY)' },
        { command: 'quote', description: 'Full market quote, volume, and depth' },
        { command: 'ohlc', description: 'Open, High, Low, Close quotes' },
        { command: 'gtt', description: 'View Good-Till-Triggered (GTT) orders' },
        { command: 'alerts', description: 'View price and indicator alerts' },
        { command: 'auctions', description: 'View portfolio holdings in auction' },
        { command: 'convert_pos', description: 'Convert position product (MIS to CNC)' },
        { command: 'profile', description: 'View Zerodha user profile & segments' },
        { command: 'view_risk', description: 'View risk limits and daily loss' },
        { command: 'set_risk', description: 'Update risk management parameters' },
        { command: 'kill_switch', description: 'Emergency stop and order liquidation' },
        { command: 'status', description: 'Check system health and auth status' },
        { command: 'login', description: 'Get Zerodha OAuth login link' },
      ]);
      console.log('[Bot] Registered Telegram command menu (setMyCommands).');
    } catch (cmdErr) {
      console.warn('[Bot] Failed to set Telegram command menu:', cmdErr);
    }

    await this.bot.launch();
    console.log('[Bot] Telegram bot is running.');
  }

  /** Gracefully stop the bot. */
  async stop(reason?: string): Promise<void> {
    await this.bot.stop(reason);
  }
}

export const telegramBot = new TelegramBot();

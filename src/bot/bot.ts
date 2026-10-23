// ============================================================
// Trade Master – Telegram Bot (Telegraf)
// Main bot setup, middleware, command registration, and
// signal dispatch with inline keyboard handling.
// ============================================================
import { Telegraf, Context, Markup } from 'telegraf';
import { config } from '../config';
import type { TradingSignal } from '../types';
import { buildSignalKeyboard } from './keyboards';
import { formatSignalCard, formatSignalExecuted, formatSignalDismissed, formatSignalExpired } from './formatters';
import { handleSetRule } from './commands/setRule';
import { handleListRules } from './commands/listRules';
import { handleDelRule } from './commands/delRule';
import { handleViewRisk, handleSetRisk } from './commands/riskCommands';
import { handleKillSwitch } from './commands/killSwitch';
import { orderManager } from '../orders/orderManager';
import { riskManager } from '../risk/riskManager';
import { getKiteInstance } from '../auth/authServer';
import { isAuthenticated } from '../auth/sessionManager';

/** Active pending signals awaiting user response. */
interface PendingSignal {
  signal: TradingSignal;
  messageId: number;
  timeoutHandle: NodeJS.Timeout;
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
      void ctx.reply(
        `👋 *Welcome to Trade Master!*\n\n` +
        `🔐 */login* — Get Zerodha login link\n` +
        `📋 */list_rules* — View all active rules\n` +
        `➕ */set_rule* — Add a new strategy rule\n` +
        `🗑️ */del_rule <id>* — Delete a rule\n` +
        `📊 */view_risk* — View risk settings & P&L\n` +
        `⚙️ */set_risk <key> <val>* — Update risk limit\n` +
        `🚨 */kill_switch* — Emergency liquidation\n` +
        `💀 */panic* — Same as kill_switch`,
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('login', async (ctx) => {
      if (isAuthenticated()) {
        await ctx.reply('✅ Already authenticated for today. Session is active.');
        return;
      }
      const loginUrl = `http://localhost:${config.port}/login`;
      await ctx.reply(
        `🔐 *Zerodha Login Required*\n\nClick the link below to authenticate:\n${loginUrl}\n\n` +
        `_Note: Access tokens expire daily. You must re-login each trading day._`,
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('list_rules', (ctx) => void handleListRules(ctx));
    this.bot.command('set_rule', (ctx) => void handleSetRule(ctx));
    this.bot.command('del_rule', (ctx) => void handleDelRule(ctx));
    this.bot.command('view_risk', (ctx) => void handleViewRisk(ctx));
    this.bot.command('set_risk', (ctx) => void handleSetRisk(ctx));
    this.bot.command('kill_switch', (ctx) => void handleKillSwitch(ctx));
    this.bot.command('panic', (ctx) => void handleKillSwitch(ctx));

    this.bot.command('positions', async (ctx) => {
      if (!isAuthenticated()) {
        await ctx.reply('❌ Not authenticated. Use /login first.');
        return;
      }
      const { net } = await orderManager.getPositions();
      const open = net.filter((p) => p.quantity !== 0);
      await ctx.reply(
        `📊 *Open Positions (${open.length})*\n\n` + orderManager.formatPositionSummary(open),
        { parse_mode: 'Markdown' },
      );
    });

    this.bot.command('status', async (ctx) => {
      const authStatus = isAuthenticated() ? '🟢 Authenticated' : '🔴 Not Authenticated';
      const riskCfg = riskManager.getConfig();
      const tradingStatus = riskCfg.trading_enabled ? '🟢 Active' : '🔴 Disabled';

      await ctx.reply(
        `🖥️ *System Status*\n\n` +
        `Auth: ${authStatus}\n` +
        `Trading: ${tradingStatus}\n`,
        { parse_mode: 'Markdown' },
      );
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

    // Clear timeout and remove from pending map BEFORE API calls (idempotency guard)
    clearTimeout(pending.timeoutHandle);
    this.pendingSignals.delete(signalId);

    // Remove inline buttons immediately to prevent double-click
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

    const { signal } = pending;

    // Final risk check before execution
    const riskCheck = await riskManager.checkSignal(signal);
    if (!riskCheck.allowed) {
      await ctx.editMessageText(
        `🚫 *Order Blocked by Risk Manager*\n\nReason: ${riskCheck.reason}`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    // Place the order
    const result = await orderManager.placeOrder({
      tradingsymbol: signal.tradingsymbol,
      exchange: signal.exchange,
      transaction_type: signal.action,
      quantity: signal.qty,
      order_type: 'MARKET',
      product: signal.product,
      variety: 'regular',
    });

    if (result.success && result.orderId) {
      await ctx.editMessageText(
        formatSignalExecuted(signal, result.orderId),
        { parse_mode: 'Markdown' },
      );
    } else {
      await ctx.editMessageText(
        `❌ *Order Failed*\n\nError: ${result.error ?? 'Unknown error'}\n\nPlease check your positions manually.`,
        { parse_mode: 'Markdown' },
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

    await ctx.editMessageText(
      formatSignalDismissed(pending.signal),
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * Dispatch a trading signal card to the user.
   * Sets up a timeout to expire the signal after the configured duration.
   */
  async dispatchSignal(signal: TradingSignal): Promise<void> {
    const card = formatSignalCard(signal);
    const keyboard = buildSignalKeyboard(signal.id);

    try {
      const sent = await this.bot.telegram.sendMessage(
        config.telegramAllowedUserId,
        card,
        { parse_mode: 'Markdown', ...keyboard },
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
    if (!this.pendingSignals.has(signal.id)) return; // Already handled

    this.pendingSignals.delete(signal.id);

    try {
      await this.bot.telegram.editMessageText(
        config.telegramAllowedUserId,
        messageId,
        undefined,
        formatSignalExpired(signal, config.signalTimeoutSeconds),
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      console.warn('[Bot] Could not edit expired signal message:', err);
    }
  }

  /**
   * Send a plain notification message to the configured user.
   */
  async notify(message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(config.telegramAllowedUserId, message, {
        parse_mode: 'Markdown',
      });
    } catch (err: unknown) {
      console.error('[Bot] Failed to send notification:', err);
    }
  }

  /** Start the bot (long polling). */
  async launch(): Promise<void> {
    console.log('[Bot] Starting Telegram bot (long polling)...');
    await this.bot.launch();
    console.log('[Bot] Telegram bot is running.');
  }

  /** Gracefully stop the bot. */
  async stop(reason?: string): Promise<void> {
    await this.bot.stop(reason);
  }
}

export const telegramBot = new TelegramBot();

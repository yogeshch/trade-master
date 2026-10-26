// ============================================================
// Trade Master – /set_rule Command & Interactive Rule Wizard
// Supports template-based wizard (EMA Crossover + RSI + Volume)
// and custom advanced JSON / key=value rules.
// ============================================================
import { Context, Markup } from 'telegraf';
import { readConfig, writeConfig } from '../../storage/storage';
import type {
  Rule,
  StrategiesConfig,
  PriceRangeRule,
  MACrossRule,
  IndexOptionRule,
  CompositeRule,
} from '../../types';
import { escapeHTML } from '../formatters';

// Simple UUID-like ID generator
function generateId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export interface WizardSession {
  step:
    | 'CHOOSE_TYPE'
    | 'EMA_SYMBOL'
    | 'EMA_ACTION'
    | 'EMA_TIMEFRAME'
    | 'EMA_CONFIG'
    | 'EMA_SL_TARGET';
  symbol?: string;
  action?: 'BUY' | 'SELL';
  timeframe?: '1m' | '3m' | '5m';
  fastEMA?: number;
  slowEMA?: number;
  rsiMin?: number;
  rsiMax?: number;
  volumeCondition?: 'GREATER_THAN_PREVIOUS' | 'ANY';
  qty?: number;
  product?: 'MIS' | 'CNC';
  stopLossPct?: number;
  targetPct?: number;
}

// In-memory active wizard sessions by Telegram User ID
const activeSessions: Map<number, WizardSession> = new Map();

/**
 * Send the main /set_rule menu with Sub-options.
 */
export async function sendRuleMenu(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  activeSessions.set(userId, { step: 'CHOOSE_TYPE' });

  const menuText =
    `⚙️ <b>Strategy Rule Creator</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Select how you would like to create your strategy rule:\n\n` +
    `1️⃣ <b>EMA Crossover Strategy (Recommended)</b>\n` +
    `   • Golden / Death Cross (EMA 20 &amp; 50)\n` +
    `   • RSI (30–70) Momentum Filter\n` +
    `   • Volume &gt; Previous Candle Confirmation\n` +
    `   • Automated Target (+5%) &amp; Stop Loss (-2%)\n\n` +
    `2️⃣ <b>Custom Rule (Advanced)</b>\n` +
    `   • Specify custom JSON or key=value parameters\n` +
    `━━━━━━━━━━━━━━━━━━━━━`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('1️⃣ EMA Crossover Strategy', 'WIZ_TYPE_EMA'),
    ],
    [
      Markup.button.callback('2️⃣ Custom Rule (Advanced)', 'WIZ_TYPE_CUSTOM'),
    ],
    [
      Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
    ],
  ]);

  await ctx.reply(menuText, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Handle wizard inline keyboard callbacks.
 * Returns true if handled.
 */
export async function handleWizardCallback(ctx: Context, data: string): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;

  if (data === 'WIZ_CANCEL') {
    activeSessions.delete(userId);
    await ctx.reply('❌ Rule creation cancelled.');
    return true;
  }

  // Option 1: Start EMA Crossover Wizard
  if (data === 'WIZ_TYPE_EMA') {
    activeSessions.set(userId, {
      step: 'EMA_SYMBOL',
      fastEMA: 20,
      slowEMA: 50,
      rsiMin: 30,
      rsiMax: 70,
      volumeCondition: 'GREATER_THAN_PREVIOUS',
      stopLossPct: 2.0,
      targetPct: 5.0,
    });

    const msg =
      `📈 <b>Step 1/5: Select or Type Stock Symbol</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Pick a popular liquid stock or type any NSE symbol (e.g. <code>INFY</code>, <code>TCS</code>, <code>RELIANCE</code>):`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('INFY', 'WIZ_SYM_INFY'),
        Markup.button.callback('RELIANCE', 'WIZ_SYM_RELIANCE'),
        Markup.button.callback('TCS', 'WIZ_SYM_TCS'),
      ],
      [
        Markup.button.callback('HDFCBANK', 'WIZ_SYM_HDFCBANK'),
        Markup.button.callback('TATAMOTORS', 'WIZ_SYM_TATAMOTORS'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Option 2: Custom Rule Info
  if (data === 'WIZ_TYPE_CUSTOM') {
    activeSessions.delete(userId);
    const msg =
      `📝 <b>Custom Rule Builder (Advanced)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `You can paste a JSON or key=value string directly with <code>/set_rule</code>:\n\n` +
      `<b>Example 1 (Price Breakout):</b>\n` +
      `<code>/set_rule type=PRICE_RANGE symbol=INFY exchange=NSE upper=1950 lower=1850 action=BUY qty=10 product=MIS</code>\n\n` +
      `<b>Example 2 (EMA Cross):</b>\n` +
      `<code>/set_rule type=MA_CROSS symbol=TCS exchange=NSE timeframe=5m fastMA=9 slowMA=21 action=BUY qty=5 product=MIS</code>\n\n` +
      `<b>Example 3 (Composite Multi-Indicator):</b>\n` +
      `<code>/set_rule {"type":"COMPOSITE","symbol":"INFY","exchange":"NSE","timeframe":"5m","fastEMA":20,"slowEMA":50,"rsiMin":30,"rsiMax":70,"action":"BUY","qty":10,"product":"MIS","target_pct":5,"stop_loss_pct":2}</code>`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
    return true;
  }

  const session = activeSessions.get(userId);
  if (!session) return false;

  // Handle Symbol pick
  if (data.startsWith('WIZ_SYM_')) {
    session.symbol = data.replace('WIZ_SYM_', '');
    session.step = 'EMA_ACTION';

    const msg =
      `🎯 <b>Step 2/5: Trade Action for ${session.symbol}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Do you want to enter on Bullish Cross (BUY) or Bearish Cross (SELL/Short)?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 BUY / Long', 'WIZ_ACT_BUY'),
        Markup.button.callback('🔴 SELL / Short', 'WIZ_ACT_SELL'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Handle Action pick
  if (data === 'WIZ_ACT_BUY' || data === 'WIZ_ACT_SELL') {
    session.action = data === 'WIZ_ACT_BUY' ? 'BUY' : 'SELL';
    session.step = 'EMA_TIMEFRAME';

    const msg =
      `⏱️ <b>Step 3/5: Select Candle Timeframe</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Candle duration for EMA and RSI calculations (Default: <b>5m</b>):`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('5m (Recommended)', 'WIZ_TF_5m'),
        Markup.button.callback('3m', 'WIZ_TF_3m'),
        Markup.button.callback('1m', 'WIZ_TF_1m'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Handle Timeframe pick
  if (data.startsWith('WIZ_TF_')) {
    session.timeframe = data.replace('WIZ_TF_', '') as '1m' | '3m' | '5m';
    session.step = 'EMA_CONFIG';

    const msg =
      `⚙️ <b>Step 4/5: Technical Indicator Parameters</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `• Fast EMA / Slow EMA: <b>20 / 50</b>\n` +
      `• RSI Filter: <b>${session.action === 'BUY' ? '30 – 70' : '&gt; 70'}</b>\n` +
      `• Volume Condition: <b>Volume &gt; Previous Candle</b>\n\n` +
      `<i>Click below to accept standard settings:</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Accept Standard (EMA 20/50 + RSI + Vol)', 'WIZ_CONF_OK'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Handle Indicator Config
  if (data === 'WIZ_CONF_OK') {
    session.step = 'EMA_SL_TARGET';

    const msg =
      `🎯 <b>Step 5/5: Automated Stop Loss, Target &amp; Quantity</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Default exit parameters:\n` +
      `• Stop Loss: <b>-2.0% loss</b>\n` +
      `• Target Profit: <b>+5.0% profit</b>\n` +
      `• Quantity: <b>10 shares (MIS Intraday)</b>\n\n` +
      `<i>Click a preset below or type custom (e.g. <code>25 MIS 1.5 4.0</code>):</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Default (10 MIS | 2% SL | 5% Target)', 'WIZ_FIN_DEF'),
      ],
      [
        Markup.button.callback('5 MIS | 2% SL | 5% Target', 'WIZ_FIN_5MIS'),
        Markup.button.callback('1 CNC | 2% SL | 5% Target', 'WIZ_FIN_1CNC'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  // Handle Final Presets
  if (data.startsWith('WIZ_FIN_')) {
    if (data === 'WIZ_FIN_DEF') {
      session.qty = 10;
      session.product = 'MIS';
    } else if (data === 'WIZ_FIN_5MIS') {
      session.qty = 5;
      session.product = 'MIS';
    } else if (data === 'WIZ_FIN_1CNC') {
      session.qty = 1;
      session.product = 'CNC';
    }
    session.stopLossPct = 2.0;
    session.targetPct = 5.0;

    await finalizeWizardRule(ctx, session);
    activeSessions.delete(userId);
    return true;
  }

  return false;
}

/**
 * Handle text input during active wizard session.
 * Returns true if the message was handled by the wizard.
 */
export async function handleWizardText(ctx: Context, text: string): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;

  const session = activeSessions.get(userId);
  if (!session) return false;

  const trimmed = text.trim();

  // If user types cancel
  if (trimmed.toLowerCase() === 'cancel') {
    activeSessions.delete(userId);
    await ctx.reply('❌ Rule creation wizard cancelled.');
    return true;
  }

  if (session.step === 'EMA_SYMBOL') {
    session.symbol = trimmed.toUpperCase().replace(/^NSE:/, '');
    session.step = 'EMA_ACTION';

    const msg =
      `🎯 <b>Step 2/5: Trade Action for ${session.symbol}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Do you want to enter on Bullish Cross (BUY) or Bearish Cross (SELL)?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🟢 BUY / Long', 'WIZ_ACT_BUY'),
        Markup.button.callback('🔴 SELL / Short', 'WIZ_ACT_SELL'),
      ],
      [
        Markup.button.callback('❌ Cancel', 'WIZ_CANCEL'),
      ],
    ]);

    await ctx.reply(msg, { parse_mode: 'HTML', ...keyboard });
    return true;
  }

  if (session.step === 'EMA_SL_TARGET') {
    // Expected format: <qty> <product> <SL%> <Target%> (e.g. "20 MIS 2.0 5.0")
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 1) {
      session.qty = parseInt(parts[0], 10) || 10;
      session.product = (parts[1]?.toUpperCase() as 'MIS' | 'CNC') || 'MIS';
      session.stopLossPct = parts[2] ? parseFloat(parts[2]) : 2.0;
      session.targetPct = parts[3] ? parseFloat(parts[3]) : 5.0;

      await finalizeWizardRule(ctx, session);
      activeSessions.delete(userId);
      return true;
    }
  }

  return false;
}

/**
 * Finalize and save the Composite Rule into strategies.json.
 */
async function finalizeWizardRule(ctx: Context, session: WizardSession): Promise<void> {
  const symbol = session.symbol ?? 'INFY';
  const action = session.action ?? 'BUY';
  const timeframe = session.timeframe ?? '5m';
  const qty = session.qty ?? 10;
  const product = session.product ?? 'MIS';
  const stopLossPct = session.stopLossPct ?? 2.0;
  const targetPct = session.targetPct ?? 5.0;

  const rule: CompositeRule = {
    id: generateId(),
    type: 'COMPOSITE',
    symbol,
    exchange: 'NSE',
    timeframe,
    fastEMA: session.fastEMA ?? 20,
    slowEMA: session.slowEMA ?? 50,
    rsiPeriod: 14,
    rsiMin: session.rsiMin ?? 30,
    rsiMax: session.rsiMax ?? 70,
    volumeCondition: 'GREATER_THAN_PREVIOUS',
    action,
    qty,
    product,
    stop_loss_pct: stopLossPct,
    target_pct: targetPct,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  try {
    const config = readConfig<StrategiesConfig>('strategies.json');
    config.rules.push(rule);
    writeConfig('strategies.json', config);

    const confirmation =
      `✅ <b>Strategy Rule Created Successfully!</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Rule ID: <code>#${rule.id}</code>\n` +
      `Symbol: <b>${escapeHTML(rule.symbol)}</b> (NSE) [<code>${rule.timeframe}</code>]\n` +
      `Strategy: <b>EMA ${rule.fastEMA}/${rule.slowEMA} Cross + RSI (${rule.rsiMin}–${rule.rsiMax}) + Vol &gt; Prev</b>\n` +
      `Action: <b>${rule.action}</b> ${rule.qty} shares @ MARKET | <code>${rule.product}</code>\n` +
      `🎯 Target Profit: <b>+${rule.target_pct}%</b>\n` +
      `🛑 Stop Loss: <b>-${rule.stop_loss_pct}%</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `<i>The engine is now monitoring ${escapeHTML(rule.symbol)}. Automatic SL and Target will be attached on execution.</i>`;

    await ctx.reply(confirmation, { parse_mode: 'HTML' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to save rule: ${escapeHTML(msg)}`);
  }
}

/**
 * Handle standard /set_rule command entry.
 */
export async function handleSetRule(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message || !('text' in message)) return;

  const text = message.text ?? '';
  const argsStr = text.replace(/^\/set_rule\s*/i, '').trim();

  // If no arguments, open the interactive wizard menu
  if (!argsStr) {
    await sendRuleMenu(ctx);
    return;
  }

  // Quick shortcut: /set_rule ema INFY 10
  if (argsStr.toLowerCase().startsWith('ema')) {
    const parts = argsStr.split(/\s+/).slice(1);
    const symbol = (parts[0] || 'INFY').toUpperCase();
    const qty = parseInt(parts[1], 10) || 10;
    const action = (parts[2]?.toUpperCase() as 'BUY' | 'SELL') || 'BUY';

    await finalizeWizardRule(ctx, {
      step: 'EMA_SL_TARGET',
      symbol,
      qty,
      action,
      timeframe: '5m',
      fastEMA: 20,
      slowEMA: 50,
      rsiMin: 30,
      rsiMax: 70,
      stopLossPct: 2.0,
      targetPct: 5.0,
      product: 'MIS',
    });
    return;
  }

  // Advanced parsing (JSON or key=value)
  const parsed = parseRuleArgs(argsStr);
  if (!parsed) {
    await ctx.reply(
      '❌ Invalid rule format. Type <code>/set_rule</code> to use the interactive wizard.',
      { parse_mode: 'HTML' },
    );
    return;
  }

  const rule = buildRule(parsed);
  if (!rule) {
    await ctx.reply(
      '❌ Could not build rule. Type <code>/set_rule</code> to use the interactive wizard.',
      { parse_mode: 'HTML' },
    );
    return;
  }

  try {
    const config = readConfig<StrategiesConfig>('strategies.json');
    config.rules.push(rule);
    writeConfig('strategies.json', config);

    await ctx.reply(
      `✅ <b>Rule Added Successfully</b>\n\n` +
      `ID: <code>#${rule.id}</code>\n` +
      `Type: <code>${rule.type}</code>\n` +
      `Action: <b>${rule.action}</b> ${rule.qty} | ${rule.product}\n\n` +
      `The strategy engine will activate this rule on next evaluation.`,
      { parse_mode: 'HTML' },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to save rule: ${escapeHTML(msg)}`);
  }
}

/**
 * Attempt to parse a rule from the command arguments.
 */
function parseRuleArgs(argsStr: string): Partial<Rule> | null {
  const trimmed = argsStr.trim();

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as Partial<Rule>;
    } catch {
      return null;
    }
  }

  // Try key=value format: type=PRICE_RANGE symbol=INFY ...
  const params: Record<string, string> = {};
  const kvPattern = /(\w+)=([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = kvPattern.exec(trimmed)) !== null) {
    if (match[1] && match[2]) {
      params[match[1]] = match[2];
    }
  }

  return Object.keys(params).length > 0 ? (params as unknown as Partial<Rule>) : null;
}

/**
 * Validate and build a fully-typed Rule from parsed params.
 */
function buildRule(raw: Partial<Rule>): Rule | null {
  const base = {
    id: generateId(),
    enabled: true,
    createdAt: new Date().toISOString(),
    action: (raw.action as 'BUY' | 'SELL') ?? 'BUY',
    qty: Number(raw.qty) || 1,
    product: (raw.product as 'MIS' | 'CNC' | 'NRML') ?? 'MIS',
    stop_loss_pct: Number((raw as any).stop_loss_pct) || 2.0,
    target_pct: Number((raw as any).target_pct) || 5.0,
  };

  if (raw.type === 'COMPOSITE') {
    const r = raw as Partial<CompositeRule>;
    if (!r.symbol) return null;
    return {
      ...base,
      type: 'COMPOSITE',
      symbol: r.symbol,
      exchange: (r.exchange as any) ?? 'NSE',
      timeframe: r.timeframe ?? '5m',
      fastEMA: Number(r.fastEMA) || 20,
      slowEMA: Number(r.slowEMA) || 50,
      rsiPeriod: Number(r.rsiPeriod) || 14,
      rsiMin: Number(r.rsiMin) || 30,
      rsiMax: Number(r.rsiMax) || 70,
      volumeCondition: r.volumeCondition ?? 'GREATER_THAN_PREVIOUS',
    } as CompositeRule;
  }

  if (raw.type === 'PRICE_RANGE') {
    const r = raw as Partial<PriceRangeRule>;
    if (!r.symbol || !r.exchange) return null;
    return {
      ...base,
      type: 'PRICE_RANGE',
      symbol: r.symbol,
      exchange: r.exchange,
      upper: Number(r.upper) || 0,
      lower: Number(r.lower) || 0,
    } as PriceRangeRule;
  }

  if (raw.type === 'MA_CROSS') {
    const r = raw as Partial<MACrossRule>;
    if (!r.symbol || !r.exchange) return null;
    return {
      ...base,
      type: 'MA_CROSS',
      symbol: r.symbol,
      exchange: r.exchange,
      timeframe: r.timeframe ?? '5m',
      fastMA: Number(r.fastMA) || 9,
      slowMA: Number(r.slowMA) || 21,
      maType: r.maType ?? 'EMA',
    } as MACrossRule;
  }

  if (raw.type === 'INDEX_OPTION') {
    const r = raw as Partial<IndexOptionRule>;
    if (!r.underlying || !r.optionType) return null;
    return {
      ...base,
      type: 'INDEX_OPTION',
      underlying: r.underlying ?? 'NIFTY',
      timeframe: r.timeframe ?? '5m',
      indicator: r.indicator ?? 'RSI',
      condition: r.condition ?? '> 60',
      strikeOffset: r.strikeOffset ?? 'ATM',
      optionType: r.optionType,
      expiryType: r.expiryType ?? 'weekly',
    } as IndexOptionRule;
  }

  return null;
}

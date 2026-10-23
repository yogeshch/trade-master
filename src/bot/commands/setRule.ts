// ============================================================
// Trade Master – /set_rule Command Handler
// ============================================================
import { Context } from 'telegraf';
import { readConfig, writeConfig } from '../../storage/storage';
import type { Rule, StrategiesConfig, PriceRangeRule, MACrossRule, IndexOptionRule } from '../../types';
import { instrumentManager } from '../../instruments/instrumentManager';

// Simple UUID-like ID generator (avoids extra dependency)
function generateId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Attempt to parse a rule from the command arguments.
 * Accepts either raw JSON or a simplified key=value format.
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
  };

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

export async function handleSetRule(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message || !('text' in message)) return;

  const text = message.text ?? '';
  const argsStr = text.replace(/^\/set_rule\s*/i, '').trim();

  if (!argsStr) {
    await ctx.reply(
      '📝 *Usage:* `/set_rule <params>`\n\n' +
      '*Examples:*\n\n' +
      '`/set_rule {"type":"PRICE_RANGE","symbol":"INFY","exchange":"NSE","upper":1950,"lower":1850,"action":"BUY","qty":10,"product":"MIS"}`\n\n' +
      '`/set_rule {"type":"MA_CROSS","symbol":"NIFTY-FUT","exchange":"NFO","timeframe":"5m","fastMA":9,"slowMA":21,"maType":"EMA","action":"BUY","qty":50,"product":"MIS"}`\n\n' +
      '`/set_rule {"type":"INDEX_OPTION","underlying":"NIFTY","timeframe":"3m","indicator":"RSI","condition":"> 60","strikeOffset":"ATM","optionType":"CE","qty":50,"product":"MIS","expiryType":"weekly"}`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const parsed = parseRuleArgs(argsStr);
  if (!parsed) {
    await ctx.reply('❌ Invalid rule format. Use JSON or key=value pairs.\n\nType `/set_rule` to see examples.');
    return;
  }

  const rule = buildRule(parsed);
  if (!rule) {
    await ctx.reply(
      '❌ Could not build rule. Missing required fields.\n\n' +
      'Required: `type`, `action`, `qty`, and type-specific fields.\n' +
      'Type `/set_rule` for examples.',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  try {
    const config = readConfig<StrategiesConfig>('strategies.json');
    config.rules.push(rule);
    writeConfig('strategies.json', config);

    await ctx.reply(
      `✅ *Rule Added Successfully*\n\n` +
      `ID: \`#${rule.id}\`\n` +
      `Type: ${rule.type}\n` +
      `Action: ${rule.action} ${rule.qty} | ${rule.product}\n\n` +
      `The strategy engine will activate this rule on next evaluation.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to save rule: ${msg}`);
  }
}

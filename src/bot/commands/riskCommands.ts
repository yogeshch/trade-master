// ============================================================
// Trade Master – /view_risk and /set_risk Command Handlers
// ============================================================
import { Context } from 'telegraf';
import { riskManager } from '../../risk/riskManager';
import type { RiskConfig } from '../../types';

const VALID_RISK_KEYS: Array<keyof RiskConfig> = [
  'max_daily_loss',
  'max_open_positions',
  'max_order_value',
  'trading_enabled',
];

export async function handleViewRisk(ctx: Context): Promise<void> {
  try {
    const report = await riskManager.formatStatusReport();
    await ctx.reply(report, { parse_mode: 'Markdown' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to fetch risk status: ${msg}`);
  }
}

export async function handleSetRisk(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message || !('text' in message)) return;

  const text = message.text ?? '';
  const parts = text.replace(/^\/set_risk\s*/i, '').trim().split(/\s+/);

  if (parts.length < 2) {
    await ctx.reply(
      '📝 *Usage:* `/set_risk <key> <value>`\n\n' +
      '*Available keys:*\n' +
      `• \`max_daily_loss\` — e.g., \`5000\`\n` +
      `• \`max_open_positions\` — e.g., \`3\`\n` +
      `• \`max_order_value\` — e.g., \`100000\`\n` +
      `• \`trading_enabled\` — \`true\` or \`false\`\n\n` +
      '*Example:* `/set_risk max_daily_loss 7500`',
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const [key, rawValue] = parts;
  if (!key || !rawValue) {
    await ctx.reply('❌ Please provide both key and value.');
    return;
  }

  if (!VALID_RISK_KEYS.includes(key as keyof RiskConfig)) {
    await ctx.reply(
      `❌ Unknown risk key: \`${key}\`\n\n` +
      `Valid keys: ${VALID_RISK_KEYS.map((k) => `\`${k}\``).join(', ')}`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  const riskKey = key as keyof RiskConfig;
  let parsedValue: number | boolean;

  if (riskKey === 'trading_enabled') {
    if (rawValue !== 'true' && rawValue !== 'false') {
      await ctx.reply('❌ `trading_enabled` must be `true` or `false`.', { parse_mode: 'Markdown' });
      return;
    }
    parsedValue = rawValue === 'true';
  } else {
    parsedValue = parseFloat(rawValue);
    if (isNaN(parsedValue) || parsedValue < 0) {
      await ctx.reply(`❌ Value must be a positive number. Got: \`${rawValue}\``, { parse_mode: 'Markdown' });
      return;
    }
  }

  try {
    riskManager.updateConfig(riskKey, parsedValue);
    await ctx.reply(
      `✅ *Risk Setting Updated*\n\n` +
      `\`${riskKey}\` → \`${parsedValue}\``,
      { parse_mode: 'Markdown' },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to update risk setting: ${msg}`);
  }
}

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
  'virtual_trading',
];

export async function handleViewRisk(ctx: Context): Promise<void> {
  try {
    const report = await riskManager.formatStatusReport();
    await ctx.reply(report, { parse_mode: 'HTML' });
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
      '📝 <b>Usage:</b> <code>/set_risk &lt;key&gt; &lt;value&gt;</code>\n\n' +
      '<b>Available keys:</b>\n' +
      `• <code>virtual_trading</code> — <code>true</code> (paper) or <code>false</code> (live)\n` +
      `• <code>max_daily_loss</code> — e.g. <code>5000</code>\n` +
      `• <code>max_open_positions</code> — e.g. <code>3</code>\n` +
      `• <code>max_order_value</code> — e.g. <code>100000</code>\n` +
      `• <code>trading_enabled</code> — <code>true</code> or <code>false</code>\n\n` +
      '<b>Example:</b> <code>/set_risk virtual_trading true</code>',
      { parse_mode: 'HTML' },
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
      `❌ Unknown risk key: <code>${key}</code>\n\n` +
      `Valid keys: ${VALID_RISK_KEYS.map((k) => `<code>${k}</code>`).join(', ')}`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  const riskKey = key as keyof RiskConfig;
  let parsedValue: number | boolean;

  if (riskKey === 'trading_enabled' || riskKey === 'virtual_trading') {
    if (rawValue.toLowerCase() !== 'true' && rawValue.toLowerCase() !== 'false') {
      await ctx.reply(`❌ <code>${riskKey}</code> must be <code>true</code> or <code>false</code>.`, { parse_mode: 'HTML' });
      return;
    }
    parsedValue = rawValue.toLowerCase() === 'true';
  } else {
    parsedValue = parseFloat(rawValue);
    if (isNaN(parsedValue) || parsedValue < 0) {
      await ctx.reply(`❌ Value must be a positive number. Got: <code>${rawValue}</code>`, { parse_mode: 'HTML' });
      return;
    }
  }

  try {
    riskManager.updateConfig(riskKey, parsedValue);
    await ctx.reply(
      `✅ <b>Risk Setting Updated</b>\n\n` +
      `<code>${riskKey}</code> ➔ <b>${parsedValue}</b>`,
      { parse_mode: 'HTML' },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to update risk setting: ${msg}`);
  }
}

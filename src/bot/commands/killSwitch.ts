// ============================================================
// Trade Master – /kill_switch and /panic Command Handler
// ============================================================
import { Context } from 'telegraf';
import { getKiteInstance } from '../../auth/authServer';
import { executeKillSwitch, formatKillSwitchReport } from '../../risk/killSwitch';
import { isAuthenticated } from '../../auth/sessionManager';

export async function handleKillSwitch(ctx: Context): Promise<void> {
  if (!isAuthenticated()) {
    await ctx.reply(
      '❌ Cannot execute kill switch: not authenticated.\n\nPlease complete login first via /login.',
    );
    return;
  }

  await ctx.reply('🚨 *KILL SWITCH ACTIVATED*\n\nLiquidating all positions...', {
    parse_mode: 'Markdown',
  });

  try {
    const kite = getKiteInstance();
    const result = await executeKillSwitch(kite);
    const report = formatKillSwitchReport(result);
    await ctx.reply(report, { parse_mode: 'Markdown' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Kill switch execution error: ${msg}`);
  }
}

// ============================================================
// Trade Master – /list_rules Command Handler
// ============================================================
import { Context } from 'telegraf';
import { readConfig } from '../../storage/storage';
import type { StrategiesConfig } from '../../types';
import { formatRulesList } from '../formatters';

export async function handleListRules(ctx: Context): Promise<void> {
  try {
    const { rules } = readConfig<StrategiesConfig>('strategies.json');
    const message = formatRulesList(rules);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to load rules: ${msg}`);
  }
}

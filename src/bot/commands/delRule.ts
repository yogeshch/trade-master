// ============================================================
// Trade Master – /del_rule Command Handler
// ============================================================
import { Context } from 'telegraf';
import { readConfig, writeConfig } from '../../storage/storage';
import type { StrategiesConfig } from '../../types';

export async function handleDelRule(ctx: Context): Promise<void> {
  const message = ctx.message;
  if (!message || !('text' in message)) return;

  const text = message.text ?? '';
  const ruleId = text.replace(/^\/del_rule\s*/i, '').trim().toUpperCase();

  if (!ruleId) {
    await ctx.reply('❌ Usage: `/del_rule <rule_id>`\n\nExample: `/del_rule ABC12345`', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const config = readConfig<StrategiesConfig>('strategies.json');
    const index = config.rules.findIndex((r) => r.id === ruleId);

    if (index === -1) {
      await ctx.reply(`❌ Rule \`#${ruleId}\` not found.\n\nUse /list_rules to see all active rules.`, {
        parse_mode: 'Markdown',
      });
      return;
    }

    const deleted = config.rules.splice(index, 1)[0];
    writeConfig('strategies.json', config);

    await ctx.reply(
      `✅ *Rule Deleted*\n\n` +
      `ID: \`#${deleted?.id}\`\n` +
      `Type: ${deleted?.type}\n\n` +
      `The rule has been removed and WebSocket subscription updated.`,
      { parse_mode: 'Markdown' },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to delete rule: ${msg}`);
  }
}

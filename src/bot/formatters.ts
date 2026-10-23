// ============================================================
// Trade Master – Message Formatters
// ============================================================
import type { TradingSignal, Rule, RiskConfig } from '../types';

/**
 * Format a trading signal as a Telegram message card.
 */
export function formatSignalCard(signal: TradingSignal): string {
  const istTime = new Date(signal.timestamp.getTime() + 5.5 * 60 * 60 * 1000);
  const timeStr = istTime.toISOString().replace('T', ' ').split('.')[0] + ' IST';

  return (
    `🚨 *TRADING SIGNAL TRIGGERED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${signal.ruleName} (ID: #${signal.ruleId})\n` +
    `Symbol: \`${signal.tradingsymbol}\` (${signal.exchange})\n` +
    `Type: *${signal.action}* (MARKET) | Product: ${signal.product}\n` +
    `Quantity: ${signal.qty}\n` +
    `Current Price: ₹${signal.currentPrice.toFixed(2)}\n` +
    `Est. Margin: ₹${signal.estimatedMargin.toFixed(2)}\n` +
    `Timestamp: ${timeStr}\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as executed (appended to signal card).
 */
export function formatSignalExecuted(signal: TradingSignal, orderId: string): string {
  return (
    `✅ *ORDER EXECUTED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${signal.ruleName} (ID: #${signal.ruleId})\n` +
    `Symbol: \`${signal.tradingsymbol}\`\n` +
    `Action: ${signal.action} ${signal.qty} @ MARKET\n` +
    `Order ID: \`${orderId}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as dismissed.
 */
export function formatSignalDismissed(signal: TradingSignal): string {
  return (
    `❌ *SIGNAL DISMISSED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${signal.ruleName} (ID: #${signal.ruleId})\n` +
    `Symbol: \`${signal.tradingsymbol}\`\n` +
    `Status: Manually dismissed.\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as expired.
 */
export function formatSignalExpired(signal: TradingSignal, timeoutSeconds: number): string {
  return (
    `⚠️ *SIGNAL EXPIRED*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${signal.ruleName} (ID: #${signal.ruleId})\n` +
    `Symbol: \`${signal.tradingsymbol}\`\n` +
    `Reason: No response within ${timeoutSeconds}s. Order NOT placed.\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a list of rules for display.
 */
export function formatRulesList(rules: Rule[]): string {
  if (rules.length === 0) return '📋 *No active rules configured.*\n\nUse `/set_rule` to add one.';

  const lines = ['📋 *Active Strategy Rules*', '━━━━━━━━━━━━━━━━━━━━━'];

  for (const rule of rules) {
    const status = rule.enabled ? '🟢' : '🔴';
    lines.push(`\n${status} *#${rule.id}* — \`${rule.type}\``);

    if (rule.type === 'PRICE_RANGE') {
      lines.push(
        `  Symbol: ${rule.symbol} (${rule.exchange})\n` +
        `  Range: [${rule.lower} – ${rule.upper}]\n` +
        `  Action: ${rule.action} ${rule.qty} @ MARKET | ${rule.product}`,
      );
    } else if (rule.type === 'MA_CROSS') {
      lines.push(
        `  Symbol: ${rule.symbol} (${rule.exchange})\n` +
        `  ${rule.maType} ${rule.fastMA}/${rule.slowMA} on ${rule.timeframe}\n` +
        `  Action: ${rule.action} ${rule.qty} | ${rule.product}`,
      );
    } else if (rule.type === 'INDEX_OPTION') {
      lines.push(
        `  Underlying: ${rule.underlying} → ${rule.strikeOffset} ${rule.optionType}\n` +
        `  Indicator: ${rule.indicator} ${rule.condition} on ${rule.timeframe}\n` +
        `  Expiry: ${rule.expiryType} | Qty: ${rule.qty} | ${rule.product}`,
      );
    }
  }

  lines.push('\n━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Total: ${rules.length} rule(s)`);
  return lines.join('\n');
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

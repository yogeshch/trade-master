// ============================================================
// Trade Master – Inline Keyboard Builders
// ============================================================
import { Markup } from 'telegraf';

/**
 * Build the signal approval keyboard for a trading signal.
 * @param signalId - Unique signal ID to embed in callback data
 */
export function buildSignalKeyboard(signalId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Buy / Execute', `EXECUTE_${signalId}`),
      Markup.button.callback('❌ Dismiss', `DISMISS_${signalId}`),
    ],
  ]);
}

/**
 * Build the login URL button.
 */
export function buildLoginKeyboard(loginUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.url('🔐 Login to Zerodha', loginUrl)],
  ]);
}

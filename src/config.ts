// ============================================================
// Trade Master – App Configuration Loader
// ============================================================
import dotenv from 'dotenv';
import { AppConfig } from './types';

dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export function loadConfig(): AppConfig {
  return {
    kiteApiKey: requireEnv('KITE_API_KEY'),
    kiteApiSecret: requireEnv('KITE_API_SECRET'),
    telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    telegramAllowedUserId: parseInt(requireEnv('TELEGRAM_ALLOWED_USER_ID'), 10),
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    redirectUrl: process.env['REDIRECT_URL'] ?? 'http://localhost:3000/callback',
    signalTimeoutSeconds: parseInt(process.env['SIGNAL_TIMEOUT_SECONDS'] ?? '90', 10),
  };
}

export const config = loadConfig();

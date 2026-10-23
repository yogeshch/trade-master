// ============================================================
// Trade Master – Risk Manager
// Validates proposed orders against configured risk limits.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import type { RiskConfig, TradingSignal, RiskCheckResult } from '../types';
import { readConfig, writeConfig } from '../storage/storage';

const RISK_FILE = 'risk_management.json';

class RiskManager {
  private kite: KiteConnect | null = null;

  setKite(kite: KiteConnect): void {
    this.kite = kite;
  }

  /** Read the current risk config from disk. */
  getConfig(): RiskConfig {
    return readConfig<RiskConfig>(RISK_FILE);
  }

  /** Update a specific risk config key. */
  updateConfig(key: keyof RiskConfig, value: number | boolean): void {
    const current = this.getConfig();
    (current as unknown as Record<string, number | boolean>)[key] = value;
    writeConfig(RISK_FILE, current);
  }

  /** Enable or disable trading globally. */
  setTradingEnabled(enabled: boolean): void {
    this.updateConfig('trading_enabled', enabled);
  }

  /**
   * Fetch current day's open positions count.
   * Returns 0 if kite instance is unavailable.
   */
  async getOpenPositionCount(): Promise<number> {
    if (!this.kite) return 0;
    try {
      const positions = await this.kite.getPositions();
      const net = (positions.net ?? []) as Array<{ quantity: number }>;
      return net.filter((p) => p.quantity !== 0).length;
    } catch {
      return 0;
    }
  }

  /**
   * Fetch today's realized + unrealized PnL.
   */
  async getTodayPnL(): Promise<{ realized: number; unrealized: number; total: number }> {
    if (!this.kite) return { realized: 0, unrealized: 0, total: 0 };
    try {
      const positions = await this.kite.getPositions();
      const day = (positions.day ?? []) as Array<{ realised: number; unrealised: number }>;
      const realized = day.reduce((acc, p) => acc + (p.realised ?? 0), 0);
      const unrealized = day.reduce((acc, p) => acc + (p.unrealised ?? 0), 0);
      return { realized, unrealized, total: realized + unrealized };
    } catch {
      return { realized: 0, unrealized: 0, total: 0 };
    }
  }

  /**
   * Check if a proposed trading signal is allowed by risk rules.
   */
  async checkSignal(signal: TradingSignal): Promise<RiskCheckResult> {
    const cfg = this.getConfig();

    // 1. Global kill switch
    if (!cfg.trading_enabled) {
      return { allowed: false, reason: '🔴 Trading is disabled (kill switch active).' };
    }

    // 2. Max order value
    const orderValue = signal.currentPrice * signal.qty;
    if (orderValue > cfg.max_order_value) {
      return {
        allowed: false,
        reason: `Order value ₹${orderValue.toFixed(2)} exceeds max allowed ₹${cfg.max_order_value}.`,
      };
    }

    // 3. Max open positions
    const openCount = await this.getOpenPositionCount();
    if (openCount >= cfg.max_open_positions) {
      return {
        allowed: false,
        reason: `Max open positions reached (${openCount}/${cfg.max_open_positions}).`,
      };
    }

    // 4. Daily loss limit
    const pnl = await this.getTodayPnL();
    if (pnl.total <= -Math.abs(cfg.max_daily_loss)) {
      // Auto-disable trading
      this.setTradingEnabled(false);
      return {
        allowed: false,
        reason: `Daily loss limit hit (₹${Math.abs(pnl.total).toFixed(2)} >= ₹${cfg.max_daily_loss}). Trading auto-disabled.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Format a risk status report for display in Telegram.
   */
  async formatStatusReport(): Promise<string> {
    const cfg = this.getConfig();
    const pnl = await this.getTodayPnL();
    const positions = await this.getOpenPositionCount();

    const status = cfg.trading_enabled ? '🟢 Active' : '🔴 Disabled (Kill Switch)';
    const pnlEmoji = pnl.total >= 0 ? '🟢' : '🔴';

    return (
      `📊 *Risk Management Status*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `Trading: ${status}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📉 Max Daily Loss: ₹${cfg.max_daily_loss.toLocaleString()}\n` +
      `📦 Max Open Positions: ${cfg.max_open_positions}\n` +
      `💰 Max Order Value: ₹${cfg.max_order_value.toLocaleString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `${pnlEmoji} Today's P&L: ₹${pnl.total.toFixed(2)}\n` +
      `  Realized: ₹${pnl.realized.toFixed(2)}\n` +
      `  Unrealized: ₹${pnl.unrealized.toFixed(2)}\n` +
      `📊 Open Positions: ${positions}/${cfg.max_open_positions}`
    );
  }
}

export const riskManager = new RiskManager();

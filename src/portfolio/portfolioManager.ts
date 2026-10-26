// ============================================================
// Trade Master – Portfolio Manager
// Handles holdings, positions, position conversion, and auctions.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { getKiteInstance } from '../auth/authServer';
import { getAccessToken } from '../auth/sessionManager';
import type { Holding, HoldingsSummary, PositionConversionParams, AuctionInstrument } from '../types';
import type { Position } from '../orders/orderManager';

class PortfolioManager {
  private kite: KiteConnect | null = null;

  setKite(kite: KiteConnect): void {
    this.kite = kite;
  }

  private ensureKite(): KiteConnect {
    if (!this.kite) {
      this.kite = getKiteInstance();
    }
    const token = getAccessToken();
    if (token && this.kite.access_token !== token) {
      this.kite.setAccessToken(token);
    }
    return this.kite;
  }

  /**
   * Fetch long-term equity delivery holdings from Demat.
   * Computes totals for investment, current value, and P&L.
   */
  async getHoldings(): Promise<HoldingsSummary> {
    const kite = this.ensureKite();
    try {
      const raw = await kite.getHoldings();
      const holdings: Holding[] = (raw as unknown as Holding[]) ?? [];

      let totalInvestment = 0;
      let currentValue = 0;
      let dayPnL = 0;

      for (const h of holdings) {
        const qty = h.quantity + (h.t1_quantity ?? 0);
        const invested = qty * h.average_price;
        const current = qty * h.last_price;
        totalInvestment += invested;
        currentValue += current;
        if (h.day_change !== undefined) {
          dayPnL += (h.day_change * qty);
        }
      }

      const totalPnL = currentValue - totalInvestment;
      const pnlPercentage = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

      return {
        holdings,
        totalInvestment,
        currentValue,
        totalPnL,
        pnlPercentage,
        dayPnL,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PortfolioManager] Failed to fetch holdings:', message);
      throw err;
    }
  }

  /**
   * Fetch all short-term and intraday positions (both net and day).
   */
  async getPositions(): Promise<{ net: Position[]; day: Position[] }> {
    const kite = this.ensureKite();
    try {
      const positions = await kite.getPositions();
      return {
        net: (positions.net as unknown as Position[]) ?? [],
        day: (positions.day as unknown as Position[]) ?? [],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PortfolioManager] Failed to fetch positions:', message);
      throw err;
    }
  }

  /**
   * Convert an open position's margin product (e.g. MIS -> CNC / NRML or vice versa).
   */
  async convertPosition(params: PositionConversionParams): Promise<boolean> {
    const kite = this.ensureKite();
    try {
      console.log(
        `[PortfolioManager] Converting position ${params.tradingsymbol} ` +
        `from ${params.old_product} to ${params.new_product} (${params.quantity} qty)`
      );
      const res = await kite.convertPosition({
        exchange: params.exchange,
        tradingsymbol: params.tradingsymbol,
        transaction_type: params.transaction_type,
        position_type: params.position_type,
        quantity: params.quantity,
        old_product: params.old_product,
        new_product: params.new_product,
      });
      return Boolean(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PortfolioManager] Failed to convert position:', message);
      throw err;
    }
  }

  /**
   * Fetch list of auction instruments.
   */
  async getAuctions(): Promise<AuctionInstrument[]> {
    const kite = this.ensureKite();
    try {
      const raw = await kite.getAuctionInstruments();
      return (raw as unknown as AuctionInstrument[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[PortfolioManager] Failed to fetch auctions:', message);
      throw err;
    }
  }
}

export const portfolioManager = new PortfolioManager();

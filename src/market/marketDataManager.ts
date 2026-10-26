// ============================================================
// Trade Master – Market Data Manager
// Fetches full quotes, OHLC, LTP, and historical candles from Kite.
// Includes intelligent fallback to ticker cache, portfolio, and instruments.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { getKiteInstance } from '../auth/authServer';
import { getAccessToken } from '../auth/sessionManager';
import { instrumentManager } from '../instruments/instrumentManager';
import { indicatorEngine } from '../engine/indicatorEngine';
import { portfolioManager } from '../portfolio/portfolioManager';
import type { MarketQuote, OHLCQuote, LTPQuote, HistoricalCandle, Exchange } from '../types';

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    if ('message' in err && typeof (err as any).message === 'string') {
      return (err as any).message;
    }
    if ('error' in err && typeof (err as any).error === 'string') {
      return (err as any).error;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

class MarketDataManager {
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
   * Helper to format human symbol (e.g. "INFY", "NSE:INFY", "NIFTY") into Kite query format ("EXCHANGE:SYMBOL").
   */
  normalizeSymbol(input: string): string {
    const trimmed = input.trim().toUpperCase();
    if (trimmed.includes(':')) {
      return trimmed;
    }

    if (trimmed === 'NIFTY' || trimmed === 'NIFTY50' || trimmed === 'NIFTY 50') {
      return 'NSE:NIFTY 50';
    }
    if (trimmed === 'BANKNIFTY' || trimmed === 'NIFTY BANK') {
      return 'NSE:NIFTY BANK';
    }
    if (trimmed === 'FINNIFTY') {
      return 'NSE:NIFTY FIN SERVICE';
    }

    // Default to NSE exchange
    return `NSE:${trimmed}`;
  }

  /**
   * Parse "EXCHANGE:SYMBOL" into { exchange, symbol }
   */
  private parseExchangeAndSymbol(formatted: string): { exchange: Exchange; symbol: string } {
    const parts = formatted.split(':');
    if (parts.length >= 2) {
      return { exchange: parts[0] as Exchange, symbol: parts.slice(1).join(':') };
    }
    return { exchange: 'NSE', symbol: formatted };
  }

  /**
   * Fallback lookup: gets price from ticker cache, holdings, or instrument master.
   */
  private async getFallbackPrice(formatted: string): Promise<{ token: number; price: number; name: string } | null> {
    const { exchange, symbol } = this.parseExchangeAndSymbol(formatted);
    const inst = instrumentManager.findBySymbol(symbol, exchange);
    if (!inst) return null;

    let livePrice = indicatorEngine.getLatestPrice(inst.instrument_token);
    let price = livePrice !== undefined && livePrice > 0 ? livePrice : inst.last_price;

    if (price === 0) {
      try {
        const { holdings } = await portfolioManager.getHoldings();
        const found = holdings.find((h) => h.tradingsymbol === symbol);
        if (found && found.last_price > 0) {
          price = found.last_price;
        }
      } catch {
        // ignore fallback errors
      }
    }

    return { token: inst.instrument_token, price, name: inst.name || inst.tradingsymbol };
  }

  /**
   * Fetch Last Traded Price (LTP) for one or more instruments.
   * e.g. ["NSE:INFY", "NSE:RELIANCE"]
   */
  async getLTP(instruments: string[]): Promise<Record<string, LTPQuote>> {
    const kite = this.ensureKite();
    const formatted = instruments.map((i) => this.normalizeSymbol(i));
    try {
      const res = await kite.getLTP(formatted);
      return (res as unknown as Record<string, LTPQuote>) ?? {};
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      console.warn(`[MarketDataManager] Kite getLTP notice (${message}). Checking instrument/portfolio cache fallback...`);

      await instrumentManager.ensureLoaded();
      const fallbackQuotes: Record<string, LTPQuote> = {};

      for (const item of formatted) {
        const fallback = await this.getFallbackPrice(item);
        if (fallback) {
          fallbackQuotes[item] = {
            instrument_token: fallback.token,
            last_price: fallback.price,
          };
        }
      }

      if (Object.keys(fallbackQuotes).length > 0) {
        return fallbackQuotes;
      }

      throw new Error(message);
    }
  }

  /**
   * Fetch OHLC and LTP for one or more instruments.
   */
  async getOHLC(instruments: string[]): Promise<Record<string, OHLCQuote>> {
    const kite = this.ensureKite();
    const formatted = instruments.map((i) => this.normalizeSymbol(i));
    try {
      const res = await kite.getOHLC(formatted);
      return (res as unknown as Record<string, OHLCQuote>) ?? {};
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      console.warn(`[MarketDataManager] Kite getOHLC notice (${message}). Checking instrument/portfolio cache fallback...`);

      await instrumentManager.ensureLoaded();
      const fallbackQuotes: Record<string, OHLCQuote> = {};

      for (const item of formatted) {
        const fallback = await this.getFallbackPrice(item);
        if (fallback) {
          fallbackQuotes[item] = {
            instrument_token: fallback.token,
            last_price: fallback.price,
            ohlc: {
              open: fallback.price,
              high: fallback.price,
              low: fallback.price,
              close: fallback.price,
            },
          };
        }
      }

      if (Object.keys(fallbackQuotes).length > 0) {
        return fallbackQuotes;
      }

      throw new Error(message);
    }
  }

  /**
   * Fetch full market quotes (depth, OHLC, volume, circuit limits, LTP).
   */
  async getQuote(instruments: string[]): Promise<Record<string, MarketQuote>> {
    const kite = this.ensureKite();
    const formatted = instruments.map((i) => this.normalizeSymbol(i));
    try {
      const res = await kite.getQuote(formatted);
      return (res as unknown as Record<string, MarketQuote>) ?? {};
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      console.warn(`[MarketDataManager] Kite getQuote notice (${message}). Checking instrument/portfolio cache fallback...`);

      await instrumentManager.ensureLoaded();
      const fallbackQuotes: Record<string, MarketQuote> = {};

      for (const item of formatted) {
        const fallback = await this.getFallbackPrice(item);
        if (fallback) {
          fallbackQuotes[item] = {
            instrument_token: fallback.token,
            timestamp: new Date().toISOString(),
            last_price: fallback.price,
            last_quantity: 0,
            last_trade_time: new Date().toISOString(),
            average_price: fallback.price,
            volume: 0,
            buy_quantity: 0,
            sell_quantity: 0,
            ohlc: {
              open: fallback.price,
              high: fallback.price,
              low: fallback.price,
              close: fallback.price,
            },
            net_change: 0,
          };
        }
      }

      if (Object.keys(fallbackQuotes).length > 0) {
        return fallbackQuotes;
      }

      throw new Error(message);
    }
  }

  /**
   * Fetch historical candles for an instrument token.
   */
  async getHistoricalData(
    instrumentToken: number,
    interval: string = 'day',
    from: string | Date,
    to: string | Date,
    continuous: boolean = false,
    oi: boolean = false
  ): Promise<HistoricalCandle[]> {
    const kite = this.ensureKite();
    try {
      const raw = await kite.getHistoricalData(instrumentToken, interval, from, to, continuous, oi);
      if (!Array.isArray(raw)) return [];

      return raw.map((item: any) => {
        if (Array.isArray(item)) {
          return {
            date: String(item[0]),
            open: Number(item[1]),
            high: Number(item[2]),
            low: Number(item[3]),
            close: Number(item[4]),
            volume: Number(item[5]),
            oi: item[6] !== undefined ? Number(item[6]) : undefined,
          };
        }
        return item as HistoricalCandle;
      });
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      console.error('[MarketDataManager] Failed to fetch historical data:', message);
      throw new Error(message);
    }
  }
}

export const marketDataManager = new MarketDataManager();

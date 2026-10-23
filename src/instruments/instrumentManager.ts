// ============================================================
// Trade Master – Instrument Manager
// Fetches, caches, and looks up Zerodha instrument master data.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import type { Instrument, Exchange, Underlying, ExpiryType, OptionType, StrikeOffset } from '../types';

// Strike step sizes per index
const STRIKE_STEPS: Record<Underlying, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
};

// NFO segment name for futures lookup
const SPOT_SYMBOLS: Record<Underlying, string> = {
  NIFTY: 'NIFTY 50',
  BANKNIFTY: 'NIFTY BANK',
};

class InstrumentManager {
  private instruments: Instrument[] = [];
  private lastFetchTime: Date | null = null;
  private kite: KiteConnect | null = null;

  /**
   * Set the authenticated kite instance.
   */
  setKite(kite: KiteConnect): void {
    this.kite = kite;
  }

  /**
   * Fetch and cache the full instrument master from Zerodha.
   */
  async fetchInstruments(): Promise<void> {
    if (!this.kite) throw new Error('[InstrumentManager] KiteConnect instance not set.');

    console.log('[InstrumentManager] Fetching instrument master...');
    const raw = await this.kite.getInstruments();
    this.instruments = raw as unknown as Instrument[];
    this.lastFetchTime = new Date();
    console.log(`[InstrumentManager] Loaded ${this.instruments.length} instruments.`);
  }

  /**
   * Ensure instruments are loaded; fetch if not yet cached.
   */
  async ensureLoaded(): Promise<void> {
    if (this.instruments.length === 0) {
      await this.fetchInstruments();
    }
  }

  /**
   * Find a specific instrument by trading symbol and exchange.
   */
  findBySymbol(tradingsymbol: string, exchange: Exchange): Instrument | undefined {
    return this.instruments.find(
      (i) => i.tradingsymbol === tradingsymbol && i.exchange === exchange,
    );
  }

  /**
   * Get all instruments for a given exchange.
   */
  getByExchange(exchange: Exchange): Instrument[] {
    return this.instruments.filter((i) => i.exchange === exchange);
  }

  /**
   * Get the spot (index) price for a given underlying.
   * Uses the NSE index instrument.
   */
  getSpotPrice(underlying: Underlying): number {
    const spotSymbol = SPOT_SYMBOLS[underlying];
    const spotInstrument = this.instruments.find(
      (i) => i.name === spotSymbol && i.exchange === 'NSE',
    );
    return spotInstrument?.last_price ?? 0;
  }

  /**
   * Round a price to the nearest valid strike for a given underlying.
   */
  roundToStrike(price: number, underlying: Underlying): number {
    const step = STRIKE_STEPS[underlying];
    return Math.round(price / step) * step;
  }

  /**
   * Parse strike offset string (e.g., 'ATM', 'ATM+1', 'ATM-2') into a numeric offset.
   */
  parseStrikeOffset(offset: StrikeOffset): number {
    if (offset === 'ATM') return 0;
    const match = offset.match(/^ATM([+-]\d+)$/);
    if (!match || !match[1]) return 0;
    return parseInt(match[1], 10);
  }

  /**
   * Get the nearest expiry date (weekly or monthly) for NFO derivatives.
   */
  getNearestExpiry(
    underlying: Underlying,
    expiryType: ExpiryType,
    instrumentType: 'CE' | 'PE' | 'FUT',
  ): Date | null {
    const nfoInstruments = this.instruments.filter(
      (i) =>
        i.exchange === 'NFO' &&
        i.name === underlying &&
        i.instrument_type === instrumentType &&
        i.expiry,
    );

    if (nfoInstruments.length === 0) return null;

    const now = new Date();
    const futureExpiries = nfoInstruments
      .map((i) => new Date(i.expiry))
      .filter((d) => d >= now)
      .sort((a, b) => a.getTime() - b.getTime());

    if (futureExpiries.length === 0) return null;

    if (expiryType === 'weekly') {
      return futureExpiries[0] ?? null;
    }

    // Monthly: find last Thursday of the month (standard NSE monthly expiry)
    const nearestMonthly = futureExpiries.find((d) => {
      // Check if this is the last Thursday of the month
      const nextWeek = new Date(d);
      nextWeek.setDate(d.getDate() + 7);
      return d.getDay() === 4 && nextWeek.getMonth() !== d.getMonth();
    });

    return nearestMonthly ?? futureExpiries[0] ?? null;
  }

  /**
   * Resolve an options contract given parameters.
   * Returns the matched Instrument or null.
   */
  getOptionContract(params: {
    underlying: Underlying;
    expiryType: ExpiryType;
    strikeOffset: StrikeOffset;
    optionType: OptionType;
    spotPrice?: number;
  }): Instrument | null {
    const { underlying, expiryType, strikeOffset, optionType, spotPrice } = params;

    const spot = spotPrice ?? this.getSpotPrice(underlying);
    if (!spot) {
      console.warn(`[InstrumentManager] Could not determine spot price for ${underlying}`);
      return null;
    }

    const atmStrike = this.roundToStrike(spot, underlying);
    const offsetSteps = this.parseStrikeOffset(strikeOffset);
    const step = STRIKE_STEPS[underlying];
    const targetStrike = atmStrike + offsetSteps * step;

    const targetExpiry = this.getNearestExpiry(underlying, expiryType, optionType);
    if (!targetExpiry) {
      console.warn(`[InstrumentManager] No expiry found for ${underlying} ${expiryType}`);
      return null;
    }

    const expiryStr = targetExpiry.toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const match = this.instruments.find(
      (i) =>
        i.exchange === 'NFO' &&
        i.name === underlying &&
        i.instrument_type === optionType &&
        i.strike === targetStrike &&
        i.expiry === expiryStr,
    );

    if (!match) {
      console.warn(
        `[InstrumentManager] No contract found: ${underlying} ${targetStrike}${optionType} ` +
        `expiry=${expiryStr}`,
      );
    }

    return match ?? null;
  }

  /**
   * Get a futures contract for an underlying.
   */
  getFuturesContract(underlying: Underlying, expiryType: ExpiryType = 'monthly'): Instrument | null {
    const targetExpiry = this.getNearestExpiry(underlying, expiryType, 'FUT');
    if (!targetExpiry) return null;

    const expiryStr = targetExpiry.toISOString().split('T')[0];

    return (
      this.instruments.find(
        (i) =>
          i.exchange === 'NFO' &&
          i.name === underlying &&
          i.instrument_type === 'FUT' &&
          i.expiry === expiryStr,
      ) ?? null
    );
  }

  /**
   * Get instrument by token number.
   */
  getByToken(token: number): Instrument | undefined {
    return this.instruments.find((i) => i.instrument_token === token);
  }

  getLastFetchTime(): Date | null {
    return this.lastFetchTime;
  }

  getTotalCount(): number {
    return this.instruments.length;
  }
}

// Singleton export
export const instrumentManager = new InstrumentManager();

// ============================================================
// Trade Master – Candle Aggregator
// Converts raw tick data into 1m, 3m, 5m OHLCV bars.
// ============================================================
import type { Tick, OHLCVBar, Timeframe } from '../types';

const TIMEFRAME_MINUTES: Record<Timeframe, number> = {
  '1m': 1,
  '3m': 3,
  '5m': 5,
};

type BarClosedCallback = (bar: OHLCVBar) => void;

interface PartialBar {
  instrument_token: number;
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  periodStart: Date;
}

class CandleAggregator {
  /** Map key: `${instrument_token}_${timeframe}` */
  private partialBars: Map<string, PartialBar> = new Map();
  private callbacks: BarClosedCallback[] = [];

  onBarClosed(cb: BarClosedCallback): void {
    this.callbacks.push(cb);
  }

  /** Compute the period start time for a tick given a timeframe. */
  private getPeriodStart(timestamp: Date, timeframe: Timeframe): Date {
    const minutes = TIMEFRAME_MINUTES[timeframe];
    const ms = timestamp.getTime();
    const periodMs = minutes * 60 * 1000;
    const periodStart = Math.floor(ms / periodMs) * periodMs;
    return new Date(periodStart);
  }

  /** Process a single tick against a specific timeframe. */
  private processTick(tick: Tick, timeframe: Timeframe): void {
    const key = `${tick.instrument_token}_${timeframe}`;
    const periodStart = this.getPeriodStart(tick.timestamp, timeframe);

    const existing = this.partialBars.get(key);

    if (!existing) {
      // Start a new bar
      this.partialBars.set(key, {
        instrument_token: tick.instrument_token,
        timeframe,
        open: tick.last_price,
        high: tick.last_price,
        low: tick.last_price,
        close: tick.last_price,
        volume: tick.volume ?? 0,
        periodStart,
      });
      return;
    }

    // Same period: update existing bar
    if (periodStart.getTime() === existing.periodStart.getTime()) {
      existing.high = Math.max(existing.high, tick.last_price);
      existing.low = Math.min(existing.low, tick.last_price);
      existing.close = tick.last_price;
      existing.volume += tick.volume ?? 0;
      return;
    }

    // New period: close the old bar and emit it
    const closedBar: OHLCVBar = {
      instrument_token: existing.instrument_token,
      timeframe: existing.timeframe,
      open: existing.open,
      high: existing.high,
      low: existing.low,
      close: existing.close,
      volume: existing.volume,
      timestamp: existing.periodStart,
      isClosed: true,
    };

    this.callbacks.forEach((cb) => cb(closedBar));

    // Start a fresh bar for the new period
    this.partialBars.set(key, {
      instrument_token: tick.instrument_token,
      timeframe,
      open: tick.last_price,
      high: tick.last_price,
      low: tick.last_price,
      close: tick.last_price,
      volume: tick.volume ?? 0,
      periodStart,
    });
  }

  /** Process a batch of ticks across all registered timeframes. */
  processTicks(ticks: Tick[], timeframes: Timeframe[] = ['1m', '3m', '5m']): void {
    for (const tick of ticks) {
      for (const tf of timeframes) {
        this.processTick(tick, tf);
      }
    }
  }

  /** Get the current (open) bar for a given token + timeframe. */
  getCurrentBar(token: number, timeframe: Timeframe): OHLCVBar | null {
    const key = `${token}_${timeframe}`;
    const bar = this.partialBars.get(key);
    if (!bar) return null;
    return {
      instrument_token: bar.instrument_token,
      timeframe: bar.timeframe,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      timestamp: bar.periodStart,
      isClosed: false,
    };
  }

  /** Get historical closed bars for a token + timeframe (up to last N). */
  private closedBars: Map<string, OHLCVBar[]> = new Map();

  /** Store closed bars (called internally). */
  private storeClosedBar(bar: OHLCVBar): void {
    const key = `${bar.instrument_token}_${bar.timeframe}`;
    if (!this.closedBars.has(key)) this.closedBars.set(key, []);
    const bars = this.closedBars.get(key)!;
    bars.push(bar);
    // Keep only last 500 bars per instrument/timeframe
    if (bars.length > 500) bars.shift();
  }

  getClosedBars(token: number, timeframe: Timeframe, count?: number): OHLCVBar[] {
    const key = `${token}_${timeframe}`;
    const bars = this.closedBars.get(key) ?? [];
    return count ? bars.slice(-count) : bars;
  }

  constructor() {
    // Automatically store closed bars
    this.onBarClosed((bar) => this.storeClosedBar(bar));
  }
}

export const candleAggregator = new CandleAggregator();

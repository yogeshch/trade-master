// ============================================================
// Trade Master – Indicator Engine
// Evaluates technical indicators on closed OHLCV bars.
// ============================================================
import {
  EMA,
  SMA,
  RSI,
  MACD,
} from 'technicalindicators';
import type { OHLCVBar, MAType, Rule, MACrossRule, IndexOptionRule, PriceRangeRule, Tick } from '../types';
import { candleAggregator } from './candleAggregator';
import { readConfig } from '../storage/storage';
import type { StrategiesConfig } from '../types';

export interface SignalEvent {
  ruleId: string;
  triggered: boolean;
  reason: string;
  lastPrice?: number;
  relatedBar?: OHLCVBar;
}

type SignalCallback = (event: SignalEvent) => void;

class IndicatorEngine {
  private signalCallbacks: SignalCallback[] = [];
  /** Map of instrument_token => latest tick price */
  private latestPrices: Map<number, number> = new Map();

  onSignal(cb: SignalCallback): void {
    this.signalCallbacks.push(cb);
  }

  private emit(event: SignalEvent): void {
    this.signalCallbacks.forEach((cb) => cb(event));
  }

  /** Update the latest price for a token. */
  updateLatestPrice(tick: Tick): void {
    this.latestPrices.set(tick.instrument_token, tick.last_price);
  }

  getLatestPrice(token: number): number | undefined {
    return this.latestPrices.get(token);
  }

  /** Compute EMA or SMA values from a price series. */
  private computeMA(prices: number[], period: number, maType: MAType): number[] {
    if (maType === 'EMA') {
      return EMA.calculate({ period, values: prices });
    }
    return SMA.calculate({ period, values: prices });
  }

  /** Evaluate a MA_CROSS rule against the latest closed bars. */
  evaluateMACross(rule: MACrossRule, token: number): SignalEvent {
    const bars = candleAggregator.getClosedBars(token, rule.timeframe);
    const closes = bars.map((b) => b.close);
    const lastBar = bars[bars.length - 1];

    const minRequired = Math.max(rule.fastMA, rule.slowMA) + 5;
    if (closes.length < minRequired) {
      return {
        ruleId: rule.id,
        triggered: false,
        reason: `Insufficient bars (${closes.length}/${minRequired}) for ${rule.maType} ${rule.fastMA}/${rule.slowMA}`,
      };
    }

    const fastValues = this.computeMA(closes, rule.fastMA, rule.maType);
    const slowValues = this.computeMA(closes, rule.slowMA, rule.maType);

    // Align arrays
    const fastCurr = fastValues[fastValues.length - 1];
    const fastPrev = fastValues[fastValues.length - 2];
    const slowCurr = slowValues[slowValues.length - 1];
    const slowPrev = slowValues[slowValues.length - 2];

    if (
      fastCurr === undefined || fastPrev === undefined ||
      slowCurr === undefined || slowPrev === undefined
    ) {
      return { ruleId: rule.id, triggered: false, reason: 'Insufficient MA data points' };
    }

    const bullishCross = fastPrev <= slowPrev && fastCurr > slowCurr;
    const bearishCross = fastPrev >= slowPrev && fastCurr < slowCurr;

    const crossOccurred = rule.action === 'BUY' ? bullishCross : bearishCross;

    return {
      ruleId: rule.id,
      triggered: crossOccurred,
      reason: crossOccurred
        ? `${rule.maType} ${rule.fastMA}/${rule.slowMA} ${rule.action === 'BUY' ? 'bullish' : 'bearish'} cross confirmed`
        : `No ${rule.action === 'BUY' ? 'bullish' : 'bearish'} cross detected (fast=${fastCurr?.toFixed(2)}, slow=${slowCurr?.toFixed(2)})`,
      lastPrice: this.latestPrices.get(token),
      relatedBar: lastBar,
    };
  }

  /** Evaluate a PRICE_RANGE rule against the latest tick. */
  evaluatePriceRange(rule: PriceRangeRule, token: number): SignalEvent {
    const price = this.latestPrices.get(token);

    if (price === undefined) {
      return { ruleId: rule.id, triggered: false, reason: 'No tick data available' };
    }

    let triggered = false;
    let reason = '';

    if (rule.action === 'BUY' && price > rule.upper) {
      triggered = true;
      reason = `Price ${price} broke above upper breakout level ${rule.upper}`;
    } else if (rule.action === 'SELL' && price < rule.lower) {
      triggered = true;
      reason = `Price ${price} broke below lower breakout level ${rule.lower}`;
    } else {
      reason = `Price ${price} within range [${rule.lower}, ${rule.upper}]`;
    }

    return { ruleId: rule.id, triggered, reason, lastPrice: price };
  }

  /** Evaluate an INDEX_OPTION rule based on indicator values. */
  evaluateIndexOption(rule: IndexOptionRule, token: number): SignalEvent {
    const bars = candleAggregator.getClosedBars(token, rule.timeframe);
    const closes = bars.map((b) => b.close);
    const lastBar = bars[bars.length - 1];

    if (closes.length < 30) {
      return {
        ruleId: rule.id,
        triggered: false,
        reason: `Insufficient bars (${closes.length}/30) for ${rule.indicator} evaluation`,
      };
    }

    let indicatorValue: number | null = null;

    if (rule.indicator === 'RSI') {
      const rsiValues = RSI.calculate({ period: 14, values: closes });
      indicatorValue = rsiValues[rsiValues.length - 1] ?? null;
    } else if (rule.indicator === 'MACD') {
      const macdResult = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      const last = macdResult[macdResult.length - 1];
      indicatorValue = last?.histogram ?? null;
    }

    if (indicatorValue === null) {
      return { ruleId: rule.id, triggered: false, reason: `${rule.indicator} value unavailable` };
    }

    // Parse and evaluate the condition string (e.g., '> 60', '< 30')
    const triggered = this.evaluateCondition(indicatorValue, rule.condition);

    return {
      ruleId: rule.id,
      triggered,
      reason: triggered
        ? `${rule.indicator} = ${indicatorValue.toFixed(2)} satisfies condition '${rule.condition}'`
        : `${rule.indicator} = ${indicatorValue.toFixed(2)} does not satisfy '${rule.condition}'`,
      lastPrice: this.latestPrices.get(token),
      relatedBar: lastBar,
    };
  }

  /** Parse and evaluate a condition string against a numeric value. */
  private evaluateCondition(value: number, condition: string): boolean {
    const match = condition.trim().match(/^([><=!]+)\s*(\d+\.?\d*)$/);
    if (!match || !match[1] || !match[2]) return false;

    const operator = match[1];
    const threshold = parseFloat(match[2]);

    switch (operator) {
      case '>':  return value > threshold;
      case '>=': return value >= threshold;
      case '<':  return value < threshold;
      case '<=': return value <= threshold;
      case '==':
      case '=':  return Math.abs(value - threshold) < 0.001;
      default:   return false;
    }
  }

  /** Evaluate all enabled rules against a closed bar. */
  evaluateRulesOnBar(bar: OHLCVBar, tokenToRules: Map<number, Rule[]>): void {
    const rules = tokenToRules.get(bar.instrument_token) ?? [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      let event: SignalEvent;

      if (rule.type === 'MA_CROSS') {
        event = this.evaluateMACross(rule as MACrossRule, bar.instrument_token);
      } else if (rule.type === 'INDEX_OPTION') {
        event = this.evaluateIndexOption(rule as IndexOptionRule, bar.instrument_token);
      } else {
        continue; // PRICE_RANGE is tick-based, not bar-based
      }

      if (event.triggered) {
        this.emit(event);
      }
    }
  }

  /** Evaluate PRICE_RANGE rules on a tick (not bar-based). */
  evaluatePriceRulesOnTick(tick: Tick, tokenToRules: Map<number, Rule[]>): void {
    this.updateLatestPrice(tick);

    const rules = tokenToRules.get(tick.instrument_token) ?? [];

    for (const rule of rules) {
      if (!rule.enabled || rule.type !== 'PRICE_RANGE') continue;

      const event = this.evaluatePriceRange(rule as PriceRangeRule, tick.instrument_token);
      if (event.triggered) {
        this.emit(event);
      }
    }
  }
}

export const indicatorEngine = new IndicatorEngine();

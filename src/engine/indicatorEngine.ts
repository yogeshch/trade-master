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
import type { OHLCVBar, MAType, Rule, MACrossRule, IndexOptionRule, PriceRangeRule, CompositeRule, Tick } from '../types';
import { candleAggregator } from './candleAggregator';

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

  /**
   * Evaluate a COMPOSITE rule:
   * 1. EMA Crossover (Bullish or Bearish)
   * 2. RSI filter (e.g. 30 <= RSI <= 70 for BUY, or RSI >= 70 for SELL)
   * 3. Volume condition (e.g. curr volume > prev volume)
   */
  evaluateComposite(rule: CompositeRule, token: number): SignalEvent {
    const bars = candleAggregator.getClosedBars(token, rule.timeframe);
    const closes = bars.map((b) => b.close);
    const lastBar = bars[bars.length - 1];
    const prevBar = bars.length >= 2 ? bars[bars.length - 2] : undefined;

    const minRequired = Math.max(rule.fastEMA, rule.slowEMA, rule.rsiPeriod ?? 14) + 5;
    if (closes.length < minRequired) {
      return {
        ruleId: rule.id,
        triggered: false,
        reason: `Insufficient closed bars (${closes.length}/${minRequired}) on ${rule.timeframe}`,
      };
    }

    // 1. Calculate EMAs
    const fastValues = EMA.calculate({ period: rule.fastEMA, values: closes });
    const slowValues = EMA.calculate({ period: rule.slowEMA, values: closes });

    const fastCurr = fastValues[fastValues.length - 1];
    const fastPrev = fastValues[fastValues.length - 2];
    const slowCurr = slowValues[slowValues.length - 1];
    const slowPrev = slowValues[slowValues.length - 2];

    if (
      fastCurr === undefined || fastPrev === undefined ||
      slowCurr === undefined || slowPrev === undefined
    ) {
      return { ruleId: rule.id, triggered: false, reason: 'Insufficient EMA data points' };
    }

    const bullishCross = fastPrev <= slowPrev && fastCurr > slowCurr;
    const bearishCross = fastPrev >= slowPrev && fastCurr < slowCurr;
    const emaCrossed = rule.action === 'BUY' ? bullishCross : bearishCross;

    if (!emaCrossed) {
      return {
        ruleId: rule.id,
        triggered: false,
        reason: `No EMA ${rule.fastEMA}/${rule.slowEMA} ${rule.action} crossover (Fast=${fastCurr.toFixed(2)}, Slow=${slowCurr.toFixed(2)})`,
      };
    }

    // 2. Calculate RSI
    const rsiPeriod = rule.rsiPeriod ?? 14;
    const rsiValues = RSI.calculate({ period: rsiPeriod, values: closes });
    const rsiCurr = rsiValues[rsiValues.length - 1];

    if (rsiCurr === undefined) {
      return { ruleId: rule.id, triggered: false, reason: 'RSI data point unavailable' };
    }

    let rsiOk = true;
    if (rule.action === 'BUY') {
      const min = rule.rsiMin ?? 30;
      const max = rule.rsiMax ?? 70;
      rsiOk = rsiCurr >= min && rsiCurr <= max;
      if (!rsiOk) {
        return {
          ruleId: rule.id,
          triggered: false,
          reason: `RSI ${rsiCurr.toFixed(1)} outside target range [${min}, ${max}]`,
        };
      }
    } else {
      const min = rule.rsiMin ?? 70;
      rsiOk = rsiCurr >= min;
      if (!rsiOk) {
        return {
          ruleId: rule.id,
          triggered: false,
          reason: `RSI ${rsiCurr.toFixed(1)} is below sell threshold ${min}`,
        };
      }
    }

    // 3. Check Volume
    let volOk = true;
    if (rule.volumeCondition === 'GREATER_THAN_PREVIOUS' && prevBar) {
      volOk = lastBar.volume > prevBar.volume;
      if (!volOk) {
        return {
          ruleId: rule.id,
          triggered: false,
          reason: `Volume ${lastBar.volume} not greater than previous bar ${prevBar.volume}`,
        };
      }
    }

    const price = this.latestPrices.get(token) ?? lastBar.close;
    return {
      ruleId: rule.id,
      triggered: true,
      reason: `EMA ${rule.fastEMA}/${rule.slowEMA} crossover confirmed + RSI ${rsiCurr.toFixed(1)} + Volume ${lastBar.volume}` + (prevBar ? ` > ${prevBar.volume}` : ''),
      lastPrice: price,
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

      if (rule.type === 'COMPOSITE') {
        event = this.evaluateComposite(rule as CompositeRule, bar.instrument_token);
      } else if (rule.type === 'MA_CROSS') {
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

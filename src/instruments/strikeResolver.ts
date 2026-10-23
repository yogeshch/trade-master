// ============================================================
// Trade Master – Strike Resolver (convenience wrapper)
// ============================================================
import { instrumentManager } from './instrumentManager';
import type { Underlying, ExpiryType, OptionType, StrikeOffset, Instrument } from '../types';

export interface OptionContractResult {
  instrument: Instrument;
  spotPrice: number;
  atmStrike: number;
  targetStrike: number;
}

/**
 * High-level helper to resolve an option contract given trading params.
 * Throws a descriptive error if the contract cannot be found.
 */
export async function resolveOptionContract(params: {
  underlying: Underlying;
  expiryType: ExpiryType;
  strikeOffset: StrikeOffset;
  optionType: OptionType;
}): Promise<OptionContractResult> {
  await instrumentManager.ensureLoaded();

  const spotPrice = instrumentManager.getSpotPrice(params.underlying);
  if (!spotPrice) {
    throw new Error(
      `Cannot resolve option contract: spot price for ${params.underlying} is unavailable. ` +
      `Ensure the WebSocket is connected and tick data is flowing.`,
    );
  }

  const atmStrike = instrumentManager.roundToStrike(spotPrice, params.underlying);
  const offsetSteps = instrumentManager.parseStrikeOffset(params.strikeOffset);

  const STRIKE_STEPS: Record<Underlying, number> = { NIFTY: 50, BANKNIFTY: 100 };
  const step = STRIKE_STEPS[params.underlying];
  const targetStrike = atmStrike + offsetSteps * step;

  const instrument = instrumentManager.getOptionContract(params);
  if (!instrument) {
    throw new Error(
      `No option contract found: ${params.underlying} ${targetStrike}${params.optionType} ` +
      `(${params.expiryType} expiry, offset: ${params.strikeOffset})`,
    );
  }

  return { instrument, spotPrice, atmStrike, targetStrike };
}

/**
 * Format an option contract description for display.
 */
export function formatOptionDescription(result: OptionContractResult): string {
  const { instrument, spotPrice, targetStrike } = result;
  return (
    `${instrument.tradingsymbol} (Strike: ${targetStrike}, ` +
    `Spot: ${spotPrice.toFixed(2)}, ` +
    `Expiry: ${instrument.expiry}, ` +
    `LotSize: ${instrument.lot_size})`
  );
}

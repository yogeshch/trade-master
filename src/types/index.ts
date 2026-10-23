// ============================================================
// Trade Master – Shared Type Definitions
// ============================================================

// ------------------------------------
// Environment & Configuration
// ------------------------------------
export interface AppConfig {
  kiteApiKey: string;
  kiteApiSecret: string;
  telegramBotToken: string;
  telegramAllowedUserId: number;
  port: number;
  redirectUrl: string;
  signalTimeoutSeconds: number;
}

// ------------------------------------
// Session / Auth
// ------------------------------------
export interface Session {
  access_token: string;
  public_token: string;
  login_time: string;
}

// ------------------------------------
// Instruments
// ------------------------------------
export type Exchange = 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX' | 'CDS';
export type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE';
export type Underlying = 'NIFTY' | 'BANKNIFTY';
export type ExpiryType = 'weekly' | 'monthly';
export type OptionType = 'CE' | 'PE';
export type StrikeOffset = 'ATM' | 'ATM+1' | 'ATM-1' | 'ATM+2' | 'ATM-2' | string;

export interface Instrument {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry: string; // 'YYYY-MM-DD'
  strike: number;
  tick_size: number;
  lot_size: number;
  instrument_type: InstrumentType;
  segment: string;
  exchange: Exchange;
}

// ------------------------------------
// Strategy Rules
// ------------------------------------
export type RuleType = 'PRICE_RANGE' | 'MA_CROSS' | 'INDEX_OPTION';
export type OrderAction = 'BUY' | 'SELL';
export type MAType = 'EMA' | 'SMA';
export type Timeframe = '1m' | '3m' | '5m';
export type ProductType = 'MIS' | 'CNC' | 'NRML';

export interface BaseRule {
  id: string;
  type: RuleType;
  action: OrderAction;
  qty: number;
  product: ProductType;
  enabled: boolean;
  createdAt: string;
}

export interface PriceRangeRule extends BaseRule {
  type: 'PRICE_RANGE';
  symbol: string;
  exchange: Exchange;
  upper: number;
  lower: number;
}

export interface MACrossRule extends BaseRule {
  type: 'MA_CROSS';
  symbol: string;
  exchange: Exchange;
  timeframe: Timeframe;
  fastMA: number;
  slowMA: number;
  maType: MAType;
}

export interface IndexOptionRule extends BaseRule {
  type: 'INDEX_OPTION';
  underlying: Underlying;
  timeframe: Timeframe;
  indicator: 'RSI' | 'EMA_CROSS' | 'MACD';
  condition: string; // e.g. '> 60'
  strikeOffset: StrikeOffset;
  optionType: OptionType;
  expiryType: ExpiryType;
}

export type Rule = PriceRangeRule | MACrossRule | IndexOptionRule;

export interface StrategiesConfig {
  rules: Rule[];
}

// ------------------------------------
// Risk Management
// ------------------------------------
export interface RiskConfig {
  max_daily_loss: number;
  max_open_positions: number;
  max_order_value: number;
  trading_enabled: boolean;
}

// ------------------------------------
// Candles / OHLCV
// ------------------------------------
export interface Tick {
  instrument_token: number;
  last_price: number;
  timestamp: Date;
  volume?: number;
}

export interface OHLCVBar {
  instrument_token: number;
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
  isClosed: boolean;
}

// ------------------------------------
// Signals
// ------------------------------------
export interface TradingSignal {
  id: string;
  ruleId: string;
  ruleName: string;
  tradingsymbol: string;
  exchange: Exchange;
  action: OrderAction;
  orderType: 'MARKET' | 'LIMIT';
  product: ProductType;
  qty: number;
  currentPrice: number;
  estimatedMargin: number;
  timestamp: Date;
  instrumentToken: number;
}

// ------------------------------------
// Orders
// ------------------------------------
export interface PlaceOrderParams {
  tradingsymbol: string;
  exchange: Exchange;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'MIS' | 'CNC' | 'NRML';
  price?: number;
  trigger_price?: number;
  variety?: 'regular' | 'amo' | 'co' | 'iceberg';
}

export interface OrderResponse {
  order_id: string;
}

// ------------------------------------
// Risk Check Result
// ------------------------------------
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

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
export type RuleType = 'PRICE_RANGE' | 'MA_CROSS' | 'INDEX_OPTION' | 'COMPOSITE';
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
  stop_loss_pct?: number; // e.g. 2.0 (2% loss)
  target_pct?: number;    // e.g. 5.0 (5% profit)
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

export interface CompositeRule extends BaseRule {
  type: 'COMPOSITE';
  symbol: string;
  exchange: Exchange;
  timeframe: Timeframe;
  fastEMA: number;          // e.g. 20
  slowEMA: number;          // e.g. 50
  rsiPeriod?: number;       // default 14
  rsiMin?: number;          // e.g. 30
  rsiMax?: number;          // e.g. 70
  volumeCondition?: 'GREATER_THAN_PREVIOUS' | 'ANY';
}

export type Rule = PriceRangeRule | MACrossRule | IndexOptionRule | CompositeRule;

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
  virtual_trading?: boolean; // When true, orders are paper traded
}

// ------------------------------------
// Virtual Trading
// ------------------------------------
export interface VirtualPosition {
  id: string;
  ruleId?: string;
  tradingsymbol: string;
  exchange: Exchange;
  transaction_type: OrderAction;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  product: ProductType;
  stopLossPrice: number;
  targetPrice: number;
  stopLossPct: number;
  targetPct: number;
  entryTime: string;
  unrealisedPnL: number;
  unrealisedPnLPct: number;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitTime?: string;
  exitReason?: 'TARGET_HIT' | 'STOP_LOSS_HIT' | 'MANUAL_EXIT' | 'KILL_SWITCH';
  realisedPnL?: number;
}

export interface VirtualOrder {
  order_id: string;
  tradingsymbol: string;
  exchange: Exchange;
  transaction_type: OrderAction;
  quantity: number;
  price: number;
  status: 'COMPLETE' | 'CANCELLED';
  order_type: 'MARKET';
  product: ProductType;
  order_timestamp: string;
  variety: string;
  status_message?: string;
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
  stopLossPct?: number;
  targetPct?: number;
  stopLossPrice?: number;
  targetPrice?: number;
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

export interface TradeDetails {
  trade_id: string;
  order_id: string;
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  transaction_type: 'BUY' | 'SELL';
  product: string;
  average_price: number;
  quantity: number;
  fill_timestamp: string;
  exchange_timestamp?: string;
}

// ------------------------------------
// Risk Check Result
// ------------------------------------
export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

// ------------------------------------
// Portfolio (Holdings & Positions)
// ------------------------------------
export interface Holding {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  isin: string;
  product: string;
  quantity: number;
  t1_quantity: number;
  used_quantity: number;
  collateral_quantity: number;
  collateral_type: string;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export interface HoldingsSummary {
  holdings: Holding[];
  totalInvestment: number;
  currentValue: number;
  totalPnL: number;
  pnlPercentage: number;
  dayPnL: number;
}

export interface PositionConversionParams {
  exchange: string;
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  position_type: 'day' | 'overnight';
  quantity: number;
  old_product: string;
  new_product: string;
}

export interface AuctionInstrument {
  auction_number: string;
  instrument_token: number;
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  last_price: number;
  [key: string]: any;
}

// ------------------------------------
// User Profile & Margins / Funds
// ------------------------------------
export interface UserProfile {
  user_id: string;
  user_name: string;
  user_shortname?: string;
  email: string;
  user_type: string;
  broker: string;
  exchanges: string[];
  products: string[];
  order_types: string[];
  avatar_url?: string;
}

export interface SegmentMargins {
  enabled: boolean;
  net: number;
  available: {
    adhoc_margin?: number;
    cash: number;
    collateral?: number;
    intraday_payin?: number;
    live_balance?: number;
    opening_balance?: number;
  };
  utilised: {
    debits: number;
    exposure?: number;
    m2m_realised?: number;
    m2m_unrealised?: number;
    option_premium?: number;
    pnl?: number;
    span?: number;
    holding_sales?: number;
    turnover?: number;
  };
}

export interface UserMargins {
  equity: SegmentMargins;
  commodity?: SegmentMargins;
}

// ------------------------------------
// Market Quotes
// ------------------------------------
export interface DepthItem {
  quantity: number;
  price: number;
  orders: number;
}

export interface MarketQuote {
  instrument_token: number;
  timestamp: string;
  last_price: number;
  last_quantity: number;
  last_trade_time: string;
  average_price: number;
  volume: number;
  buy_quantity: number;
  sell_quantity: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  net_change: number;
  lower_circuit_limit?: number;
  upper_circuit_limit?: number;
  depth?: {
    buy: DepthItem[];
    sell: DepthItem[];
  };
  [key: string]: any;
}

export interface OHLCQuote {
  instrument_token: number;
  last_price: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
}

export interface LTPQuote {
  instrument_token: number;
  last_price: number;
}

export interface HistoricalCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi?: number;
}

// ------------------------------------
// GTT (Good Till Triggered)
// ------------------------------------
export interface GTTOrder {
  exchange: string;
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  order_type: string;
  product: string;
  price: number;
  result?: any;
}

export interface GTTTrigger {
  id: number;
  user_id: string;
  type: 'single' | 'two-leg';
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: 'active' | 'triggered' | 'disabled' | 'expired' | 'cancelled' | 'rejected';
  condition: {
    exchange: string;
    tradingsymbol: string;
    trigger_values: number[];
    last_price: number;
    instrument_token?: number;
  };
  orders: GTTOrder[];
}

export interface CreateGTTParams {
  type: 'single' | 'two-leg';
  condition: {
    exchange: string;
    tradingsymbol: string;
    trigger_values: number[];
    last_price: number;
  };
  orders: Array<{
    exchange: string;
    tradingsymbol: string;
    transaction_type: 'BUY' | 'SELL';
    quantity: number;
    order_type: 'LIMIT';
    product: 'CNC' | 'MIS' | 'NRML';
    price: number;
  }>;
}

// ------------------------------------
// Kite Alerts
// ------------------------------------
export interface KiteAlert {
  uuid: string;
  name?: string;
  lhs: string; // e.g. "NSE:INFY:LTP"
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  rhs: number | string;
  type?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export interface CreateAlertParams {
  name: string;
  lhs: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  rhs: number | string;
  type?: string;
}

export interface ModifyAlertParams {
  name?: string;
  lhs?: string;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  rhs?: number | string;
  status?: string;
}

export interface AlertHistoryItem {
  timestamp: string;
  value: number;
  status: string;
}

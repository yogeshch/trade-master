// ============================================================
// Trade Master – Message Formatters
// Generates clean HTML and Markdown message cards for Telegram.
// ============================================================
import type {
  TradingSignal,
  Rule,
  CompositeRule,
  UserProfile,
  UserMargins,
  HoldingsSummary,
  LTPQuote,
  OHLCQuote,
  MarketQuote,
  GTTTrigger,
  KiteAlert,
  AuctionInstrument,
  TradeDetails,
} from '../types';
import type { OrderDetails } from '../orders/orderManager';

/** Escape HTML entities for safe Telegram rendering */
export function escapeHTML(text: any): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format the complete interactive Command Help Menu in HTML.
 */
export function formatHelpMenu(): string {
  return (
    `🤖 <b>Trade Master – Control Center</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>🔐 Authentication &amp; System:</b>\n` +
    `  • <code>/login</code> — Get Zerodha Kite OAuth login link\n` +
    `  • <code>/mode</code> — Toggle between 🟡 Virtual (Paper) &amp; 🟢 Live trading\n` +
    `  • <code>/status</code> — System health, auth state &amp; engine status\n` +
    `  • <code>/help</code> — Display this command menu\n\n` +
    `<b>👤 Account &amp; Funds:</b>\n` +
    `  • <code>/profile</code> — Zerodha account profile &amp; segment privileges\n` +
    `  • <code>/funds</code> or <code>/margins</code> — Cash, collateral &amp; margin balances\n` +
    `  • <code>/holdings</code> — Demat portfolio holdings, invested value &amp; P&amp;L\n` +
    `  • <code>/positions</code> — Open intraday &amp; overnight positions\n` +
    `  • <code>/convert_pos &lt;sym&gt; &lt;product&gt; &lt;qty&gt;</code> — Convert product (e.g. MIS ➔ CNC)\n` +
    `  • <code>/auctions</code> — List holdings currently in auction\n\n` +
    `<b>📈 Market Quotes &amp; Ticker:</b>\n` +
    `  • <code>/ltp &lt;symbols&gt;</code> — Last Traded Price (e.g. <code>/ltp INFY, RELIANCE</code>)\n` +
    `  • <code>/quote &lt;symbols&gt;</code> — Full market quote (depth, VWAP, volume, circuits)\n` +
    `  • <code>/ohlc &lt;symbols&gt;</code> — Open, High, Low, Close &amp; day % change\n\n` +
    `<b>📋 Orders, Trades &amp; Alerts:</b>\n` +
    `  • <code>/orders</code> — Today's order book &amp; live status\n` +
    `  • <code>/trades</code> — Executed trade fills &amp; fill timestamps\n` +
    `  • <code>/gtt</code> — Good-Till-Triggered (GTT) triggers\n` +
    `  • <code>/alerts</code> — Configured price &amp; indicator alerts\n\n` +
    `<b>⚡ Strategy Rules:</b>\n` +
    `  • <code>/set_rule</code> — Interactive wizard: EMA Crossover or Custom\n` +
    `  • <code>/list_rules</code> — View all active trading strategies\n` +
    `  • <code>/del_rule &lt;id&gt;</code> — Delete a strategy rule by ID\n\n` +
    `<b>🛡️ Risk Management:</b>\n` +
    `  • <code>/view_risk</code> — View risk limits, daily loss &amp; kill-switch status\n` +
    `  • <code>/set_risk &lt;key&gt; &lt;val&gt;</code> — Set parameter (e.g. <code>/set_risk virtual_trading true</code>)\n` +
    `  • <code>/kill_switch</code> or <code>/panic</code> — Emergency kill switch &amp; cancel orders\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Tip: Tap any command above or type <code>/</code> for Telegram's interactive command menu.</i>`
  );
}

/**
 * Format a trading signal as a Telegram message card.
 */
export function formatSignalCard(signal: TradingSignal): string {
  const istTime = new Date(signal.timestamp.getTime() + 5.5 * 60 * 60 * 1000);
  const timeStr = istTime.toISOString().replace('T', ' ').split('.')[0] + ' IST';

  return (
    `🚨 <b>TRADING SIGNAL TRIGGERED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${escapeHTML(signal.ruleName)} (ID: #${signal.ruleId})\n` +
    `Symbol: <code>${escapeHTML(signal.tradingsymbol)}</code> (${signal.exchange})\n` +
    `Type: <b>${signal.action}</b> (MARKET) | Product: ${signal.product}\n` +
    `Quantity: <code>${signal.qty}</code>\n` +
    `Current Price: <b>₹${signal.currentPrice.toFixed(2)}</b>\n` +
    (signal.targetPrice ? `🎯 Target (+${signal.targetPct}%): <b>₹${signal.targetPrice.toFixed(2)}</b>\n` : '') +
    (signal.stopLossPrice ? `🛑 Stop Loss (-${signal.stopLossPct}%): <b>₹${signal.stopLossPrice.toFixed(2)}</b>\n` : '') +
    `Est. Margin: ₹${signal.estimatedMargin.toFixed(2)}\n` +
    `Timestamp: <code>${timeStr}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as executed.
 */
export function formatSignalExecuted(signal: TradingSignal, orderId: string, isVirtual: boolean = false): string {
  const modeHeader = isVirtual ? ' [Mode: Virtual]' : '';
  return (
    `✅ <b>ORDER EXECUTED${modeHeader}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${escapeHTML(signal.ruleName)} (ID: #${signal.ruleId})\n` +
    `Symbol: <code>${escapeHTML(signal.tradingsymbol)}</code>\n` +
    `Action: <b>${signal.action}</b> ${signal.qty} @ MARKET\n` +
    `Order ID: <code>${escapeHTML(orderId)}</code>\n` +
    (signal.targetPrice ? `🎯 Target (+${signal.targetPct}%): <b>₹${signal.targetPrice.toFixed(2)}</b>\n` : '') +
    (signal.stopLossPrice ? `🛑 Stop Loss (-${signal.stopLossPct}%): <b>₹${signal.stopLossPrice.toFixed(2)}</b>\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as dismissed.
 */
export function formatSignalDismissed(signal: TradingSignal): string {
  return (
    `❌ <b>SIGNAL DISMISSED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${escapeHTML(signal.ruleName)} (ID: #${signal.ruleId})\n` +
    `Symbol: <code>${escapeHTML(signal.tradingsymbol)}</code>\n` +
    `Status: Manually dismissed.\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a signal as expired.
 */
export function formatSignalExpired(signal: TradingSignal, timeoutSeconds: number): string {
  return (
    `⚠️ <b>SIGNAL EXPIRED</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Strategy: ${escapeHTML(signal.ruleName)} (ID: #${signal.ruleId})\n` +
    `Symbol: <code>${escapeHTML(signal.tradingsymbol)}</code>\n` +
    `Reason: No response within ${timeoutSeconds}s. Order NOT placed.\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format a list of rules for display.
 */
export function formatRulesList(rules: Rule[]): string {
  if (rules.length === 0) {
    return '📋 <b>No active rules configured.</b>\n\nUse <code>/set_rule</code> to add one.';
  }

  const lines = ['📋 <b>Active Strategy Rules</b>', '━━━━━━━━━━━━━━━━━━━━━'];

  for (const rule of rules) {
    const status = rule.enabled ? '🟢' : '🔴';
    lines.push(`\n${status} <b>#${rule.id}</b> — <code>${rule.type}</code>`);

    if (rule.type === 'COMPOSITE') {
      const comp = rule as CompositeRule;
      lines.push(
        `  Symbol: <b>${escapeHTML(comp.symbol)}</b> (${comp.exchange}) [${comp.timeframe}]\n` +
        `  Setup: EMA ${comp.fastEMA}/${comp.slowEMA} + RSI (${comp.rsiMin ?? 30}-${comp.rsiMax ?? 70}) + Vol\n` +
        `  Action: <b>${comp.action}</b> ${comp.qty} @ MARKET | ${comp.product}\n` +
        `  🎯 Target: <b>+${comp.target_pct ?? 5}%</b> | 🛑 Stop Loss: <b>-${comp.stop_loss_pct ?? 2}%</b>`,
      );
    } else if (rule.type === 'PRICE_RANGE') {
      lines.push(
        `  Symbol: ${escapeHTML(rule.symbol)} (${rule.exchange})\n` +
        `  Range: [${rule.lower} – ${rule.upper}]\n` +
        `  Action: ${rule.action} ${rule.qty} @ MARKET | ${rule.product}` +
        (rule.target_pct ? `\n  🎯 Target: +${rule.target_pct}% | 🛑 SL: -${rule.stop_loss_pct}%` : ''),
      );
    } else if (rule.type === 'MA_CROSS') {
      lines.push(
        `  Symbol: ${escapeHTML(rule.symbol)} (${rule.exchange})\n` +
        `  ${rule.maType} ${rule.fastMA}/${rule.slowMA} on ${rule.timeframe}\n` +
        `  Action: ${rule.action} ${rule.qty} | ${rule.product}` +
        (rule.target_pct ? `\n  🎯 Target: +${rule.target_pct}% | 🛑 SL: -${rule.stop_loss_pct}%` : ''),
      );
    } else if (rule.type === 'INDEX_OPTION') {
      lines.push(
        `  Underlying: ${rule.underlying} → ${rule.strikeOffset} ${rule.optionType}\n` +
        `  Indicator: ${rule.indicator} ${escapeHTML(rule.condition)} on ${rule.timeframe}\n` +
        `  Expiry: ${rule.expiryType} | Qty: ${rule.qty} | ${rule.product}`,
      );
    }
  }

  lines.push('\n━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Total: ${rules.length} rule(s)`);
  return lines.join('\n');
}

/**
 * Format User Profile details for display.
 */
export function formatUserProfile(profile: UserProfile): string {
  return (
    `👤 <b>Zerodha User Profile</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `User ID: <code>${escapeHTML(profile.user_id)}</code>\n` +
    `Name: <b>${escapeHTML(profile.user_name)}</b>\n` +
    `Email: <code>${escapeHTML(profile.email)}</code>\n` +
    `Broker: ${escapeHTML(profile.broker)}\n` +
    `User Type: ${escapeHTML(profile.user_type)}\n` +
    `Exchanges: <code>${escapeHTML(profile.exchanges?.join(', ') ?? 'N/A')}</code>\n` +
    `Products: <code>${escapeHTML(profile.products?.join(', ') ?? 'N/A')}</code>\n` +
    `Order Types: <code>${escapeHTML(profile.order_types?.join(', ') ?? 'N/A')}</code>\n` +
    `━━━━━━━━━━━━━━━━━━━━━`
  );
}

/**
 * Format Funds and Margins details for display.
 */
export function formatMargins(margins: UserMargins): string {
  const eq = margins.equity;
  const comm = margins.commodity;

  const lines = [
    `💰 <b>Account Funds &amp; Margins</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📈 <b>Equity Segment:</b>`,
    `  Available Cash: <b>₹${(eq?.available?.cash ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>`,
    `  Opening Balance: ₹${(eq?.available?.opening_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `  Live Balance: ₹${(eq?.available?.live_balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `  Collateral: ₹${(eq?.available?.collateral ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `  Utilised Margin: ₹${(eq?.utilised?.debits ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `  Net Margin: <b>₹${(eq?.net ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>`,
  ];

  if (comm && comm.enabled) {
    lines.push(
      `\n📦 <b>Commodity Segment:</b>`,
      `  Available Cash: <b>₹${(comm.available?.cash ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>`,
      `  Utilised: ₹${(comm.utilised?.debits ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `  Net Margin: <b>₹${(comm.net ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>`,
    );
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  return lines.join('\n');
}

/**
 * Format Portfolio Holdings for display.
 */
export function formatHoldings(summary: HoldingsSummary): string {
  if (summary.holdings.length === 0) {
    return '💼 <b>Portfolio Holdings</b>\n\n<i>No equity holdings in Demat.</i>';
  }

  const pnlEmoji = summary.totalPnL >= 0 ? '🟢' : '🔴';
  const pnlSign = summary.totalPnL >= 0 ? '+' : '';

  const lines = [
    `💼 <b>Portfolio Holdings (${summary.holdings.length})</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `Invested: ₹${summary.totalInvestment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `Current: <b>₹${summary.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>`,
    `Total P&amp;L: ${pnlEmoji} <b>${pnlSign}₹${summary.totalPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${pnlSign}${summary.pnlPercentage.toFixed(2)}%)</b>`,
    `Day's P&amp;L: ₹${summary.dayPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    `━━━━━━━━━━━━━━━━━━━━━\n`,
  ];

  for (const h of summary.holdings) {
    const qty = h.quantity + (h.t1_quantity ?? 0);
    const itemPnL = h.pnl ?? ((h.last_price - h.average_price) * qty);
    const itemEmoji = itemPnL >= 0 ? '🟢' : '🔴';
    const daySign = (h.day_change_percentage ?? 0) >= 0 ? '+' : '';

    lines.push(
      `${itemEmoji} <b>${escapeHTML(h.tradingsymbol)}</b> (${h.exchange})\n` +
      `  Qty: <code>${qty}</code> | Avg: ₹${h.average_price.toFixed(2)} | LTP: ₹${h.last_price.toFixed(2)}\n` +
      `  P&amp;L: ₹${itemPnL.toFixed(2)} | Day: ${daySign}${(h.day_change_percentage ?? 0).toFixed(2)}%\n`
    );
  }

  return lines.join('\n');
}

/**
 * Format LTP quotes for display.
 */
export function formatLTP(quotes: Record<string, LTPQuote>): string {
  const keys = Object.keys(quotes);
  if (keys.length === 0) return '📈 <i>No LTP data found.</i>';

  const lines = ['📈 <b>Last Traded Prices (LTP)</b>', '━━━━━━━━━━━━━━━━━━━━━'];
  for (const key of keys) {
    const q = quotes[key];
    lines.push(`<b>${escapeHTML(key)}</b>: <b>₹${q?.last_price?.toFixed(2) ?? 'N/A'}</b>`);
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format OHLC quotes for display.
 */
export function formatOHLC(quotes: Record<string, OHLCQuote>): string {
  const keys = Object.keys(quotes);
  if (keys.length === 0) return '📊 <i>No OHLC data found.</i>';

  const lines = ['📊 <b>OHLC Quotes</b>', '━━━━━━━━━━━━━━━━━━━━━'];
  for (const key of keys) {
    const q = quotes[key];
    if (!q) continue;
    const change = q.ohlc ? (q.last_price - q.ohlc.close) : 0;
    const changePct = q.ohlc && q.ohlc.close > 0 ? (change / q.ohlc.close) * 100 : 0;
    const emoji = change >= 0 ? '🟢' : '🔴';
    const sign = change >= 0 ? '+' : '';

    lines.push(
      `${emoji} <b>${escapeHTML(key)}</b>\n` +
      `  LTP: <b>₹${q.last_price?.toFixed(2)}</b> (${sign}${changePct.toFixed(2)}%)\n` +
      `  Open: ₹${q.ohlc?.open?.toFixed(2)} | High: ₹${q.ohlc?.high?.toFixed(2)}\n` +
      `  Low: ₹${q.ohlc?.low?.toFixed(2)} | Prev Close: ₹${q.ohlc?.close?.toFixed(2)}\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format full Market Quote for display.
 */
export function formatQuote(quotes: Record<string, MarketQuote>): string {
  const keys = Object.keys(quotes);
  if (keys.length === 0) return '📑 <i>No quote data found.</i>';

  const lines = ['📑 <b>Market Quote Details</b>', '━━━━━━━━━━━━━━━━━━━━━'];
  for (const key of keys) {
    const q = quotes[key];
    if (!q) continue;

    const change = q.ohlc ? (q.last_price - q.ohlc.close) : 0;
    const changePct = q.ohlc && q.ohlc.close > 0 ? (change / q.ohlc.close) * 100 : 0;
    const emoji = change >= 0 ? '🟢' : '🔴';
    const sign = change >= 0 ? '+' : '';

    lines.push(
      `${emoji} <b>${escapeHTML(key)}</b>\n` +
      `  LTP: <b>₹${q.last_price?.toFixed(2)}</b> (${sign}₹${change.toFixed(2)} / ${sign}${changePct.toFixed(2)}%)\n` +
      `  Avg Traded Price: ₹${q.average_price?.toFixed(2) ?? 'N/A'}\n` +
      `  Volume: ${q.volume?.toLocaleString('en-IN') ?? 0}\n` +
      `  Day Range: ₹${q.ohlc?.low?.toFixed(2)} – ₹${q.ohlc?.high?.toFixed(2)}\n` +
      `  Open: ₹${q.ohlc?.open?.toFixed(2)} | Close: ₹${q.ohlc?.close?.toFixed(2)}\n` +
      (q.lower_circuit_limit ? `  Circuit Limits: [₹${q.lower_circuit_limit?.toFixed(2)} – ₹${q.upper_circuit_limit?.toFixed(2)}]\n` : '') +
      `  Total Buy Qty: ${q.buy_quantity?.toLocaleString('en-IN') ?? 0} | Sell: ${q.sell_quantity?.toLocaleString('en-IN') ?? 0}\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format today's order book.
 */
export function formatOrders(orders: OrderDetails[]): string {
  if (orders.length === 0) return '📋 <b>Order Book</b>\n\n<i>No orders placed today.</i>';

  const lines = [`📋 <b>Today's Orders (${orders.length})</b>`, '━━━━━━━━━━━━━━━━━━━━━'];
  for (const o of orders.slice(-15)) { // show last 15
    const statusEmoji =
      o.status === 'COMPLETE' ? '🟢' :
      o.status === 'REJECTED' || o.status === 'CANCELLED' ? '🔴' : '🟡';

    lines.push(
      `${statusEmoji} <b>${escapeHTML(o.tradingsymbol)}</b> (<code>${o.status}</code>)\n` +
      `  ${o.transaction_type} ${o.filled_quantity}/${o.quantity} @ ₹${(o.average_price || o.price || 0).toFixed(2)}\n` +
      `  Type: ${o.order_type} | ${o.product} | ID: <code>${escapeHTML(o.order_id)}</code>` +
      (o.status_message ? `\n  <i>Msg: ${escapeHTML(o.status_message)}</i>` : '') +
      '\n'
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format executed trades.
 */
export function formatTrades(trades: TradeDetails[]): string {
  if (trades.length === 0) return '🧾 <b>Executed Trades</b>\n\n<i>No trades executed today.</i>';

  const lines = [`🧾 <b>Executed Trades (${trades.length})</b>`, '━━━━━━━━━━━━━━━━━━━━━'];
  for (const t of trades.slice(-15)) {
    const actionEmoji = t.transaction_type === 'BUY' ? '🔵' : '🟠';
    lines.push(
      `${actionEmoji} <b>${escapeHTML(t.tradingsymbol)}</b>\n` +
      `  ${t.transaction_type} ${t.quantity} @ <b>₹${t.average_price.toFixed(2)}</b>\n` +
      `  Trade ID: <code>${escapeHTML(t.trade_id)}</code> | Time: <code>${t.fill_timestamp || 'N/A'}</code>\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format GTT triggers.
 */
export function formatGTTs(gtts: GTTTrigger[]): string {
  if (gtts.length === 0) return '🎯 <b>GTT Triggers</b>\n\n<i>No active GTT triggers found.</i>';

  const lines = [`🎯 <b>GTT Triggers (${gtts.length})</b>`, '━━━━━━━━━━━━━━━━━━━━━'];
  for (const g of gtts) {
    const statusEmoji = g.status === 'active' ? '🟢' : '⚪';
    const cond = g.condition;
    lines.push(
      `${statusEmoji} <b>${escapeHTML(cond?.tradingsymbol ?? 'GTT')}</b> (ID: <code>${g.id}</code>)\n` +
      `  Status: <code>${g.status}</code> | Type: ${g.type}\n` +
      `  Trigger Value(s): [${cond?.trigger_values?.join(', ')}]\n` +
      `  Current LTP: ₹${cond?.last_price?.toFixed(2) ?? 'N/A'}\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format Kite Alerts.
 */
export function formatAlerts(alerts: KiteAlert[]): string {
  if (alerts.length === 0) return '🔔 <b>Price Alerts</b>\n\n<i>No alerts configured.</i>';

  const lines = [`🔔 <b>Price Alerts (${alerts.length})</b>`, '━━━━━━━━━━━━━━━━━━━━━'];
  for (const a of alerts) {
    const statusEmoji = a.status === 'ACTIVE' ? '🟢' : '⚪';
    lines.push(
      `${statusEmoji} <b>${escapeHTML(a.name || 'Alert')}</b> (<code>${escapeHTML(a.uuid)}</code>)\n` +
      `  Rule: <code>${escapeHTML(a.lhs)} ${a.operator} ${a.rhs}</code>\n` +
      `  Status: <code>${a.status || 'ACTIVE'}</code>\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Format Auction instruments.
 */
export function formatAuctions(auctions: AuctionInstrument[]): string {
  if (auctions.length === 0) return '🏷️ <b>Holdings Auctions</b>\n\n<i>No auctions currently in progress.</i>';

  const lines = [`🏷️ <b>Holdings Auctions (${auctions.length})</b>`, '━━━━━━━━━━━━━━━━━━━━━'];
  for (const a of auctions) {
    lines.push(
      `• <b>${escapeHTML(a.tradingsymbol)}</b> (${a.exchange})\n` +
      `  Auction #: <code>${escapeHTML(a.auction_number)}</code> | Qty: ${a.quantity} | LTP: ₹${a.last_price}\n`
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ============================================================
// Trade Master – Kill Switch
// Emergency liquidation of all open positions and cancellation
// of all pending orders.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { riskManager } from './riskManager';

export interface KillSwitchResult {
  cancelledOrders: string[];
  squaredOffPositions: string[];
  finalPnL: number;
  errors: string[];
}

/**
 * Execute the emergency kill switch:
 * 1. Disable trading in config.
 * 2. Cancel all pending/open orders.
 * 3. Square off all net open positions.
 * 4. Return a full status report.
 */
export async function executeKillSwitch(kite: KiteConnect): Promise<KillSwitchResult> {
  const result: KillSwitchResult = {
    cancelledOrders: [],
    squaredOffPositions: [],
    finalPnL: 0,
    errors: [],
  };

  console.log('[KillSwitch] 🔴 EMERGENCY KILL SWITCH ACTIVATED');

  // Step 1: Disable trading
  riskManager.setTradingEnabled(false);
  console.log('[KillSwitch] Trading disabled.');

  // Step 2: Cancel all pending orders
  try {
    const orders = await kite.getOrders() as Array<{
      order_id: string;
      status: string;
      variety: string;
    }>;

    const pendingStatuses = ['OPEN', 'PENDING', 'TRIGGER PENDING', 'AMO REQ RECEIVED'];
    const pendingOrders = orders.filter((o) => pendingStatuses.includes(o.status));

    console.log(`[KillSwitch] Found ${pendingOrders.length} pending orders to cancel.`);

    for (const order of pendingOrders) {
      try {
        await kite.cancelOrder(order.variety as 'regular', order.order_id);
        result.cancelledOrders.push(order.order_id);
        console.log(`[KillSwitch] Cancelled order: ${order.order_id}`);
        // Rate limit: 3 req/sec
        await sleep(400);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Cancel ${order.order_id}: ${msg}`);
        console.error(`[KillSwitch] Failed to cancel ${order.order_id}:`, msg);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GetOrders: ${msg}`);
    console.error('[KillSwitch] Failed to fetch orders:', msg);
  }

  // Step 3: Square off all open positions
  try {
    const positions = await kite.getPositions();
    const net = (positions.net ?? []) as Array<{
      tradingsymbol: string;
      exchange: string;
      quantity: number;
      product: string;
    }>;

    const openPositions = net.filter((p) => p.quantity !== 0);
    console.log(`[KillSwitch] Found ${openPositions.length} open positions to square off.`);

    for (const pos of openPositions) {
      const squareOffSide = pos.quantity > 0 ? 'SELL' : 'BUY';
      const qty = Math.abs(pos.quantity);

      try {
        await kite.placeOrder('regular', {
          tradingsymbol: pos.tradingsymbol,
          exchange: pos.exchange,
          transaction_type: squareOffSide,
          quantity: qty,
          order_type: 'MARKET',
          product: pos.product,
        });

        result.squaredOffPositions.push(`${squareOffSide} ${qty}x ${pos.tradingsymbol}`);
        console.log(`[KillSwitch] Squared off: ${squareOffSide} ${qty}x ${pos.tradingsymbol}`);
        await sleep(400); // Rate limit
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`SquareOff ${pos.tradingsymbol}: ${msg}`);
        console.error(`[KillSwitch] Failed to square off ${pos.tradingsymbol}:`, msg);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`GetPositions: ${msg}`);
    console.error('[KillSwitch] Failed to fetch positions:', msg);
  }

  // Step 4: Get final PnL
  try {
    const pnl = await riskManager.getTodayPnL();
    result.finalPnL = pnl.total;
  } catch {
    result.finalPnL = 0;
  }

  return result;
}

/**
 * Format kill switch result as a Telegram message.
 */
export function formatKillSwitchReport(result: KillSwitchResult): string {
  const pnlEmoji = result.finalPnL >= 0 ? '🟢' : '🔴';
  const lines: string[] = [
    '🚨 *KILL SWITCH EXECUTED*',
    '━━━━━━━━━━━━━━━━━━━━━',
    `Trading: 🔴 DISABLED`,
    '',
  ];

  if (result.cancelledOrders.length > 0) {
    lines.push(`✅ *Cancelled Orders (${result.cancelledOrders.length}):*`);
    result.cancelledOrders.forEach((id) => lines.push(`  • ${id}`));
    lines.push('');
  }

  if (result.squaredOffPositions.length > 0) {
    lines.push(`✅ *Squared Off Positions (${result.squaredOffPositions.length}):*`);
    result.squaredOffPositions.forEach((p) => lines.push(`  • ${p}`));
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push(`⚠️ *Errors (${result.errors.length}):*`);
    result.errors.forEach((e) => lines.push(`  • ${e}`));
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`${pnlEmoji} *Final P&L: ₹${result.finalPnL.toFixed(2)}*`);

  return lines.join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

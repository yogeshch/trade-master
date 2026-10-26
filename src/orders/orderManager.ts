// ============================================================
// Trade Master – Order Manager
// Wraps Zerodha Kite Connect REST API for order operations and
// delegates to VirtualOrderManager when Virtual Mode is active.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { getKiteInstance } from '../auth/authServer';
import { getAccessToken } from '../auth/sessionManager';
import { riskManager } from '../risk/riskManager';
import { virtualOrderManager } from './virtualOrderManager';
import { gttManager } from './gttManager';
import type { PlaceOrderParams, OrderResponse, TradeDetails, TradingSignal } from '../types';

/** Result type for order placement. */
export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

/** Details about a placed or open order from Kite. */
export interface OrderDetails {
  order_id: string;
  tradingsymbol: string;
  transaction_type: string;
  quantity: number;
  price: number;
  status: string;
  order_type: string;
  product: string;
  exchange: string;
  filled_quantity: number;
  average_price: number;
  status_message?: string;
  order_timestamp?: string;
  validity?: string;
}

/** Position details from Kite. */
export interface Position {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  product: string;
  average_price: number;
  last_price: number;
  unrealised: number;
  realised: number;
  pnl: number;
  m2m?: number;
  buy_quantity?: number;
  sell_quantity?: number;
}

/** Margin result from Kite. */
export interface MarginInfo {
  equity: {
    available: {
      cash: number;
    };
    utilised: {
      debits: number;
    };
  };
}

class OrderManager {
  private kite: KiteConnect | null = null;
  /** Rate limiting: track last order time */
  private lastOrderTime = 0;
  private readonly ORDER_INTERVAL_MS = 400; // 3 req/sec = ~333ms min interval

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

  /** Enforce rate limiting between order requests. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastOrderTime;
    if (elapsed < this.ORDER_INTERVAL_MS) {
      await sleep(this.ORDER_INTERVAL_MS - elapsed);
    }
    this.lastOrderTime = Date.now();
  }

  /**
   * Place an order. In Virtual Mode, simulates fill and attaches virtual SL/Target.
   * In Live Mode, executes via Kite Connect and attaches GTT OCO order.
   */
  async placeOrder(params: PlaceOrderParams, signal?: TradingSignal): Promise<PlaceOrderResult> {
    if (riskManager.isVirtualTrading()) {
      return virtualOrderManager.placeOrder(params, signal);
    }

    const kite = this.ensureKite();
    await this.rateLimit();

    try {
      console.log(
        `[OrderManager] Placing ${params.transaction_type} ${params.quantity}x ` +
        `${params.tradingsymbol} @ ${params.order_type}`,
      );

      const response = await kite.placeOrder(params.variety ?? 'regular', {
        tradingsymbol: params.tradingsymbol,
        exchange: params.exchange,
        transaction_type: params.transaction_type,
        quantity: params.quantity,
        order_type: params.order_type,
        product: params.product,
        price: params.price ?? 0,
        trigger_price: params.trigger_price ?? 0,
      }) as OrderResponse;

      console.log(`[OrderManager] Live Order placed: ${response.order_id}`);

      // If Target and Stop Loss are specified, automatically place GTT OCO order
      if (signal?.targetPrice && signal?.stopLossPrice) {
        try {
          const exitAction = params.transaction_type === 'BUY' ? 'SELL' : 'BUY';
          const triggerValues = [signal.stopLossPrice, signal.targetPrice].sort((a, b) => a - b);
          await gttManager.placeGTT({
            type: 'two-leg',
            condition: {
              exchange: params.exchange,
              tradingsymbol: params.tradingsymbol,
              trigger_values: triggerValues,
              last_price: signal.currentPrice,
            },
            orders: [
              {
                exchange: params.exchange,
                tradingsymbol: params.tradingsymbol,
                transaction_type: exitAction,
                quantity: params.quantity,
                order_type: 'LIMIT',
                product: params.product as 'CNC' | 'MIS' | 'NRML',
                price: signal.stopLossPrice,
              },
              {
                exchange: params.exchange,
                tradingsymbol: params.tradingsymbol,
                transaction_type: exitAction,
                quantity: params.quantity,
                order_type: 'LIMIT',
                product: params.product as 'CNC' | 'MIS' | 'NRML',
                price: signal.targetPrice,
              },
            ],
          });
          console.log(`[OrderManager] Attached GTT OCO for ${params.tradingsymbol}: SL ₹${signal.stopLossPrice}, Target ₹${signal.targetPrice}`);
        } catch (gttErr) {
          console.warn('[OrderManager] Could not attach GTT OCO order:', gttErr);
        }
      }

      return { success: true, orderId: response.order_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OrderManager] Live Order placement failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Modify an open or pending order.
   */
  async modifyOrder(
    variety: string = 'regular',
    orderId: string,
    params: {
      quantity?: number;
      price?: number;
      order_type?: string;
      trigger_price?: number;
      validity?: string;
    },
  ): Promise<boolean> {
    const kite = this.ensureKite();
    await this.rateLimit();

    try {
      await kite.modifyOrder(variety as 'regular', orderId, params);
      console.log(`[OrderManager] Modified order: ${orderId}`);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[OrderManager] Order modification failed for ${orderId}:`, message);
      return false;
    }
  }

  /**
   * Fetch today's order book. In Virtual Mode, returns virtual paper orders if available.
   */
  async getOrders(): Promise<OrderDetails[]> {
    if (riskManager.isVirtualTrading()) {
      const vOrders = virtualOrderManager.getOrders();
      if (vOrders.length > 0) {
        return vOrders.map((vo) => ({
          order_id: vo.order_id,
          tradingsymbol: vo.tradingsymbol,
          transaction_type: vo.transaction_type,
          quantity: vo.quantity,
          price: vo.price,
          status: vo.status,
          order_type: vo.order_type,
          product: vo.product,
          exchange: vo.exchange,
          filled_quantity: vo.quantity,
          average_price: vo.price,
          status_message: vo.status_message,
          order_timestamp: vo.order_timestamp,
        }));
      }
    }

    const kite = this.ensureKite();
    try {
      const orders = await kite.getOrders();
      return (orders as unknown as OrderDetails[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OrderManager] Failed to fetch orders:', message);
      return [];
    }
  }

  /**
   * Fetch executed trades for the day.
   */
  async getTrades(): Promise<TradeDetails[]> {
    const kite = this.ensureKite();
    try {
      const trades = await kite.getTrades();
      return (trades as unknown as TradeDetails[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OrderManager] Failed to fetch trades:', message);
      return [];
    }
  }

  /**
   * Fetch trades executed for a specific order.
   */
  async getOrderTrades(orderId: string): Promise<TradeDetails[]> {
    const kite = this.ensureKite();
    try {
      const trades = await kite.getOrderTrades(orderId);
      return (trades as unknown as TradeDetails[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[OrderManager] Failed to fetch trades for order ${orderId}:`, message);
      return [];
    }
  }

  /**
   * Fetch current positions (both net and day).
   */
  async getPositions(): Promise<{ net: Position[]; day: Position[] }> {
    const kite = this.ensureKite();
    try {
      const positions = await kite.getPositions();
      return {
        net: (positions.net as unknown as Position[]) ?? [],
        day: (positions.day as unknown as Position[]) ?? [],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OrderManager] Failed to fetch positions:', message);
      return { net: [], day: [] };
    }
  }

  /**
   * Fetch available margin / funds.
   */
  async getMargins(): Promise<MarginInfo | null> {
    const kite = this.ensureKite();
    try {
      const margins = await kite.getMargins() as unknown as MarginInfo;
      return margins;
    } catch (err: unknown) {
      console.error('[OrderManager] Failed to fetch margins:', err);
      return null;
    }
  }

  /**
   * Estimate margin required for a proposed order.
   */
  async estimateMargin(price: number, qty: number): Promise<number> {
    return price * qty * 0.2;
  }

  /**
   * Cancel a specific order.
   */
  async cancelOrder(orderId: string, variety: string = 'regular'): Promise<boolean> {
    const kite = this.ensureKite();
    await this.rateLimit();
    try {
      await kite.cancelOrder(variety as 'regular', orderId);
      console.log(`[OrderManager] Cancelled order: ${orderId}`);
      return true;
    } catch (err: unknown) {
      console.error(`[OrderManager] Failed to cancel order ${orderId}:`, err);
      return false;
    }
  }

  /**
   * Fetch a single order's details by ID.
   */
  async getOrderDetails(orderId: string): Promise<OrderDetails | null> {
    const kite = this.ensureKite();
    try {
      const history = await kite.getOrderHistory(orderId) as unknown as OrderDetails[];
      return history[history.length - 1] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Format a position summary for Telegram display.
   */
  formatPositionSummary(positions: Position[]): string {
    if (positions.length === 0) return '<i>No open positions</i>';

    return positions.map((p) => {
      const pnl = (p.unrealised ?? 0) + (p.realised ?? 0);
      const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
      return (
        `${pnlEmoji} <b>${p.tradingsymbol}</b> (${p.product})\n` +
        `  Qty: <code>${p.quantity}</code> | Avg: ₹${p.average_price.toFixed(2)} | LTP: ₹${p.last_price.toFixed(2)}\n` +
        `  P&amp;L: <b>₹${pnl.toFixed(2)}</b>`
      );
    }).join('\n\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const orderManager = new OrderManager();

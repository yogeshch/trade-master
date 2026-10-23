// ============================================================
// Trade Master – Order Manager
// Wraps Zerodha Kite Connect REST API for order operations.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import type { PlaceOrderParams, OrderResponse } from '../types';

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
    if (!this.kite) throw new Error('[OrderManager] KiteConnect instance not set.');
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
   * Place a single order via Kite Connect.
   * Handles rate limiting and returns a structured result.
   */
  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
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

      console.log(`[OrderManager] Order placed: ${response.order_id}`);
      return { success: true, orderId: response.order_id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OrderManager] Order placement failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Fetch all orders for the current session.
   */
  async getOrders(): Promise<OrderDetails[]> {
    const kite = this.ensureKite();
    try {
      const orders = await kite.getOrders();
      return (orders as unknown as OrderDetails[]) ?? [];
    } catch (err: unknown) {
      console.error('[OrderManager] Failed to fetch orders:', err);
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
      console.error('[OrderManager] Failed to fetch positions:', err);
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
   * Returns estimated value based on current price * qty as a fallback.
   */
  async estimateMargin(price: number, qty: number): Promise<number> {
    // A simple estimation: for MIS intraday margin is typically ~20% of order value.
    // Actual Kite margin APIs require basket margin endpoint.
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
    if (positions.length === 0) return '_No open positions_';

    return positions.map((p) => {
      const pnlEmoji = (p.unrealised + p.realised) >= 0 ? '🟢' : '🔴';
      return (
        `${pnlEmoji} *${p.tradingsymbol}*\n` +
        `  Qty: ${p.quantity} | Avg: ₹${p.average_price.toFixed(2)} | LTP: ₹${p.last_price.toFixed(2)}\n` +
        `  P&L: ₹${(p.unrealised + p.realised).toFixed(2)}`
      );
    }).join('\n\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const orderManager = new OrderManager();

// ============================================================
// Trade Master – Virtual (Paper Trading) Order & Position Manager
// Simulates live order execution and tracks Stop Loss & Target.
// ============================================================
import type {
  PlaceOrderParams,
  TradingSignal,
  VirtualPosition,
  VirtualOrder,
  Tick,
  ProductType,
  Exchange,
  OrderAction,
} from '../types';
import type { PlaceOrderResult } from './orderManager';
import { readConfig, writeConfig } from '../storage/storage';

const POSITIONS_FILE = 'virtual_positions.json';
const ORDERS_FILE = 'virtual_orders.json';

interface VirtualPositionsData {
  positions: VirtualPosition[];
}

interface VirtualOrdersData {
  orders: VirtualOrder[];
}

type ExitCallback = (position: VirtualPosition, msg: string) => Promise<void>;

class VirtualOrderManager {
  private exitCallback: ExitCallback | null = null;
  /** In-memory instrument_token to symbol map for fast tick resolution */
  private tokenToSymbol: Map<number, string> = new Map();

  setExitCallback(cb: ExitCallback): void {
    this.exitCallback = cb;
  }

  registerTokenSymbol(token: number, symbol: string): void {
    this.tokenToSymbol.set(token, symbol);
  }

  getOpenPositions(): VirtualPosition[] {
    const data = readConfig<VirtualPositionsData>(POSITIONS_FILE, { positions: [] });
    return (data.positions ?? []).filter((p) => p.status === 'OPEN');
  }

  getAllPositions(): VirtualPosition[] {
    const data = readConfig<VirtualPositionsData>(POSITIONS_FILE, { positions: [] });
    return data.positions ?? [];
  }

  getOrders(): VirtualOrder[] {
    const data = readConfig<VirtualOrdersData>(ORDERS_FILE, { orders: [] });
    return data.orders ?? [];
  }

  /**
   * Place a simulated virtual order with automated SL and Target attachment.
   */
  async placeOrder(params: PlaceOrderParams, signal?: TradingSignal): Promise<PlaceOrderResult> {
    const orderId = `VIRTUAL_${Date.now()}`;
    const fillPrice = signal?.currentPrice ?? (params as any).price ?? 100;
    const now = new Date().toISOString();

    const order: VirtualOrder = {
      order_id: orderId,
      tradingsymbol: params.tradingsymbol,
      exchange: params.exchange,
      transaction_type: params.transaction_type,
      quantity: params.quantity,
      price: fillPrice,
      status: 'COMPLETE',
      order_type: 'MARKET',
      product: (params.product as ProductType) ?? 'MIS',
      order_timestamp: now,
      variety: params.variety ?? 'regular',
      status_message: 'Simulated paper fill at market price',
    };

    // Save order
    const ordersData = readConfig<VirtualOrdersData>(ORDERS_FILE, { orders: [] });
    ordersData.orders = ordersData.orders ?? [];
    ordersData.orders.push(order);
    writeConfig(ORDERS_FILE, ordersData);

    // Compute SL and Target
    const slPct = signal?.stopLossPct ?? 2.0;
    const tpPct = signal?.targetPct ?? 5.0;

    let targetPrice: number;
    let stopLossPrice: number;

    if (params.transaction_type === 'BUY') {
      targetPrice = signal?.targetPrice ?? Number((fillPrice * (1 + tpPct / 100)).toFixed(2));
      stopLossPrice = signal?.stopLossPrice ?? Number((fillPrice * (1 - slPct / 100)).toFixed(2));
    } else {
      targetPrice = signal?.targetPrice ?? Number((fillPrice * (1 - tpPct / 100)).toFixed(2));
      stopLossPrice = signal?.stopLossPrice ?? Number((fillPrice * (1 + slPct / 100)).toFixed(2));
    }

    const position: VirtualPosition = {
      id: `VPOS_${Date.now()}`,
      ruleId: signal?.ruleId,
      tradingsymbol: params.tradingsymbol,
      exchange: params.exchange,
      transaction_type: params.transaction_type,
      quantity: params.quantity,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      product: (params.product as ProductType) ?? 'MIS',
      stopLossPrice,
      targetPrice,
      stopLossPct: slPct,
      targetPct: tpPct,
      entryTime: now,
      unrealisedPnL: 0,
      unrealisedPnLPct: 0,
      status: 'OPEN',
    };

    // Save position
    const posData = readConfig<VirtualPositionsData>(POSITIONS_FILE, { positions: [] });
    posData.positions = posData.positions ?? [];
    posData.positions.push(position);
    writeConfig(POSITIONS_FILE, posData);

    console.log(
      `[VirtualOrderManager] Executed Virtual Order ${orderId}: ${params.transaction_type} ${params.quantity} ${params.tradingsymbol} @ ₹${fillPrice}. Target: ₹${targetPrice} (+${tpPct}%), SL: ₹${stopLossPrice} (-${slPct}%)`,
    );

    return {
      success: true,
      orderId,
    };
  }

  /**
   * Monitor live ticks to trigger automated Stop Loss or Target Profit exit.
   */
  async checkExits(tick: Tick): Promise<void> {
    const symbol = this.tokenToSymbol.get(tick.instrument_token);
    const posData = readConfig<VirtualPositionsData>(POSITIONS_FILE, { positions: [] });
    let updated = false;

    for (const pos of posData.positions ?? []) {
      if (pos.status !== 'OPEN') continue;

      // Match by tradingsymbol or token if symbol known
      if (symbol && pos.tradingsymbol !== symbol) continue;

      pos.currentPrice = tick.last_price;

      if (pos.transaction_type === 'BUY') {
        pos.unrealisedPnL = (tick.last_price - pos.entryPrice) * pos.quantity;
        pos.unrealisedPnLPct = ((tick.last_price - pos.entryPrice) / pos.entryPrice) * 100;

        // Check Target
        if (tick.last_price >= pos.targetPrice) {
          pos.status = 'CLOSED';
          pos.exitPrice = tick.last_price;
          pos.exitTime = new Date().toISOString();
          pos.exitReason = 'TARGET_HIT';
          pos.realisedPnL = (tick.last_price - pos.entryPrice) * pos.quantity;
          updated = true;

          const msg =
            `🎯 <b>[Mode: Virtual] Take Profit Triggered!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Symbol: <code>${pos.tradingsymbol}</code> (${pos.exchange})\n` +
            `Action: SOLD (Target Hit)\n` +
            `Qty: <code>${pos.quantity}</code>\n` +
            `Entry Price: ₹${pos.entryPrice.toFixed(2)}\n` +
            `Exit Price: <b>₹${tick.last_price.toFixed(2)}</b> (+${pos.unrealisedPnLPct.toFixed(2)}%)\n` +
            `Realized P&amp;L: 🟢 <b>+₹${pos.realisedPnL.toFixed(2)}</b>\n` +
            `Target Was: ₹${pos.targetPrice.toFixed(2)} (+${pos.targetPct}%)\n` +
            `━━━━━━━━━━━━━━━━━━━━━`;

          console.log(`[VirtualOrderManager] Target hit for ${pos.tradingsymbol}: +₹${pos.realisedPnL.toFixed(2)}`);
          if (this.exitCallback) void this.exitCallback(pos, msg);
          continue;
        }

        // Check Stop Loss
        if (tick.last_price <= pos.stopLossPrice) {
          pos.status = 'CLOSED';
          pos.exitPrice = tick.last_price;
          pos.exitTime = new Date().toISOString();
          pos.exitReason = 'STOP_LOSS_HIT';
          pos.realisedPnL = (tick.last_price - pos.entryPrice) * pos.quantity;
          updated = true;

          const msg =
            `🛑 <b>[Mode: Virtual] Stop Loss Triggered!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Symbol: <code>${pos.tradingsymbol}</code> (${pos.exchange})\n` +
            `Action: SOLD (Stop Loss Protection)\n` +
            `Qty: <code>${pos.quantity}</code>\n` +
            `Entry Price: ₹${pos.entryPrice.toFixed(2)}\n` +
            `Exit Price: <b>₹${tick.last_price.toFixed(2)}</b> (${pos.unrealisedPnLPct.toFixed(2)}%)\n` +
            `Realized P&amp;L: 🔴 <b>₹${pos.realisedPnL.toFixed(2)}</b>\n` +
            `SL Level Was: ₹${pos.stopLossPrice.toFixed(2)} (-${pos.stopLossPct}%)\n` +
            `━━━━━━━━━━━━━━━━━━━━━`;

          console.log(`[VirtualOrderManager] Stop loss hit for ${pos.tradingsymbol}: ₹${pos.realisedPnL.toFixed(2)}`);
          if (this.exitCallback) void this.exitCallback(pos, msg);
          continue;
        }
      } else {
        // SELL / SHORT position
        pos.unrealisedPnL = (pos.entryPrice - tick.last_price) * pos.quantity;
        pos.unrealisedPnLPct = ((pos.entryPrice - tick.last_price) / pos.entryPrice) * 100;

        if (tick.last_price <= pos.targetPrice) {
          pos.status = 'CLOSED';
          pos.exitPrice = tick.last_price;
          pos.exitTime = new Date().toISOString();
          pos.exitReason = 'TARGET_HIT';
          pos.realisedPnL = (pos.entryPrice - tick.last_price) * pos.quantity;
          updated = true;

          const msg =
            `🎯 <b>[Mode: Virtual] Short Take Profit Triggered!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Symbol: <code>${pos.tradingsymbol}</code> (${pos.exchange})\n` +
            `Action: BOUGHT TO COVER (Target Hit)\n` +
            `Qty: <code>${pos.quantity}</code>\n` +
            `Entry Price: ₹${pos.entryPrice.toFixed(2)}\n` +
            `Exit Price: <b>₹${tick.last_price.toFixed(2)}</b>\n` +
            `Realized P&amp;L: 🟢 <b>+₹${pos.realisedPnL.toFixed(2)}</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━`;

          if (this.exitCallback) void this.exitCallback(pos, msg);
          continue;
        }

        if (tick.last_price >= pos.stopLossPrice) {
          pos.status = 'CLOSED';
          pos.exitPrice = tick.last_price;
          pos.exitTime = new Date().toISOString();
          pos.exitReason = 'STOP_LOSS_HIT';
          pos.realisedPnL = (pos.entryPrice - tick.last_price) * pos.quantity;
          updated = true;

          const msg =
            `🛑 <b>[Mode: Virtual] Short Stop Loss Triggered!</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `Symbol: <code>${pos.tradingsymbol}</code> (${pos.exchange})\n` +
            `Action: BOUGHT TO COVER (Stop Loss Hit)\n` +
            `Qty: <code>${pos.quantity}</code>\n` +
            `Entry Price: ₹${pos.entryPrice.toFixed(2)}\n` +
            `Exit Price: <b>₹${tick.last_price.toFixed(2)}</b>\n` +
            `Realized P&amp;L: 🔴 <b>₹${pos.realisedPnL.toFixed(2)}</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━`;

          if (this.exitCallback) void this.exitCallback(pos, msg);
          continue;
        }
      }
    }

    if (updated) {
      writeConfig(POSITIONS_FILE, posData);
    }
  }

  /**
   * Format Virtual Positions for Telegram display.
   */
  formatVirtualSummary(): string {
    const open = this.getOpenPositions();
    if (open.length === 0) {
      return (
        `💼 <b>Virtual Portfolio (Paper Trading)</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `<i>No open virtual positions.</i>\n\n` +
        `<i>Simulated orders will appear here when strategies execute in Virtual Mode.</i>`
      );
    }

    const totalPnL = open.reduce((acc, p) => acc + p.unrealisedPnL, 0);
    const pnlEmoji = totalPnL >= 0 ? '🟢' : '🔴';
    const pnlSign = totalPnL >= 0 ? '+' : '';

    const lines = [
      `💼 <b>Virtual Portfolio (${open.length} Open Positions)</b>`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `Total Unrealized P&amp;L: ${pnlEmoji} <b>${pnlSign}₹${totalPnL.toFixed(2)}</b>`,
      `━━━━━━━━━━━━━━━━━━━━━\n`,
    ];

    for (const p of open) {
      const itemEmoji = p.unrealisedPnL >= 0 ? '🟢' : '🔴';
      const itemSign = p.unrealisedPnL >= 0 ? '+' : '';
      lines.push(
        `${itemEmoji} <b>${p.tradingsymbol}</b> (${p.exchange}) — <code>${p.transaction_type}</code>\n` +
        `  Qty: <code>${p.quantity}</code> | Entry: ₹${p.entryPrice.toFixed(2)} | Current: ₹${p.currentPrice.toFixed(2)}\n` +
        `  P&amp;L: <b>${itemSign}₹${p.unrealisedPnL.toFixed(2)} (${itemSign}${p.unrealisedPnLPct.toFixed(2)}%)</b>\n` +
        `  🎯 Target: <b>₹${p.targetPrice.toFixed(2)}</b> (+${p.targetPct}%)\n` +
        `  🛑 Stop Loss: <b>₹${p.stopLossPrice.toFixed(2)}</b> (-${p.stopLossPct}%)\n`,
      );
    }

    return lines.join('\n');
  }
}

export const virtualOrderManager = new VirtualOrderManager();

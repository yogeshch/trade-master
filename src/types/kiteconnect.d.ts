declare module 'kiteconnect' {
  export class KiteConnect {
    access_token?: string;
    api_key?: string;
    constructor(options: { api_key: string; access_token?: string });
    getLoginURL(): string;
    generateSession(request_token: string, api_secret: string): Promise<{
      access_token: string;
      public_token: string;
      user_id?: string;
      user_name?: string;
      [key: string]: any;
    }>;
    setAccessToken(token: string): void;
    invalidateAccessToken(access_token?: string): Promise<any>;
    getProfile(): Promise<{
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
      [key: string]: any;
    }>;
    getMargins(segment?: string): Promise<any>;
    getHoldings(): Promise<any[]>;
    getAuctionInstruments(): Promise<any[]>;
    getPositions(): Promise<{ net?: any[]; day?: any[] }>;
    convertPosition(params: {
      exchange: string;
      tradingsymbol: string;
      transaction_type: string;
      position_type: string;
      quantity: number;
      old_product: string;
      new_product: string;
    }): Promise<boolean>;
    getInstruments(exchange?: string): Promise<any[]>;
    getQuote(instruments: string | string[]): Promise<Record<string, any>>;
    getOHLC(instruments: string | string[]): Promise<Record<string, any>>;
    getLTP(instruments: string | string[]): Promise<Record<string, any>>;
    getHistoricalData(
      instrument_token: number,
      interval: string,
      from_date: string | Date,
      to_date: string | Date,
      continuous?: boolean,
      oi?: boolean
    ): Promise<any[]>;
    getTriggerRange(transaction_type: string, instruments: string | string[]): Promise<any>;
    getOrders(): Promise<any[]>;
    getOrderHistory(order_id: string): Promise<any[]>;
    getTrades(): Promise<any[]>;
    getOrderTrades(order_id: string): Promise<any[]>;
    placeOrder(variety: string, params: any): Promise<{ order_id: string; [key: string]: any }>;
    modifyOrder(variety: string, order_id: string, params: any): Promise<{ order_id: string; [key: string]: any }>;
    cancelOrder(variety: string, order_id: string, params?: any): Promise<any>;
    exitOrder(variety: string, order_id: string, params?: any): Promise<any>;
    orderMargins(orders: any[], mode?: string | null): Promise<any[]>;
    orderBasketMargins(orders: any[], consider_positions?: boolean, mode?: string | null): Promise<any>;
    getGTTs(): Promise<any[]>;
    getGTT(trigger_id: number): Promise<any>;
    placeGTT(params: any): Promise<{ trigger_id: number; [key: string]: any }>;
    modifyGTT(trigger_id: number, params: any): Promise<{ trigger_id: number; [key: string]: any }>;
    deleteGTT(trigger_id: number): Promise<{ trigger_id: number; [key: string]: any }>;
  }

  export class KiteTicker {
    modeLTP: any;
    modeQuote: any;
    modeFull: any;
    constructor(options: {
      api_key: string;
      access_token: string;
      reconnect?: boolean;
      max_reconnect?: number;
      reconnect_interval?: number;
      [key: string]: any;
    });
    connect(): void;
    disconnect(): void;
    subscribe(tokens: number[]): void;
    unsubscribe(tokens: number[]): void;
    setMode(mode: any, tokens: number[]): void;
    on(event: 'ticks', callback: (ticks: any[]) => void): void;
    on(event: 'connect', callback: () => void): void;
    on(event: 'disconnect', callback: (error: Error) => void): void;
    on(event: 'error', callback: (error: Error) => void): void;
    on(event: 'reconnect', callback: (retries: number, interval: number) => void): void;
    on(event: 'noreconnect', callback: () => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
  }
}

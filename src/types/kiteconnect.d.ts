declare module 'kiteconnect' {
  export class KiteConnect {
    access_token?: string;
    constructor(options: { api_key: string });
    getLoginURL(): string;
    generateSession(request_token: string, api_secret: string): Promise<{
      access_token: string;
      public_token: string;
      [key: string]: any;
    }>;
    setAccessToken(token: string): void;
    getInstruments(): Promise<any[]>;
    getOrders(): Promise<any[]>;
    cancelOrder(variety: string, order_id: string): Promise<any>;
    getPositions(): Promise<{ net?: any[]; day?: any[] }>;
    placeOrder(variety: string, params: any): Promise<{ order_id: string; [key: string]: any }>;
    getMargins(): Promise<any>;
    getOrderHistory(order_id: string): Promise<any[]>;
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

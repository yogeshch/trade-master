// ============================================================
// Trade Master – KiteTicker WebSocket Client
// Handles real-time market data subscription with auto-reconnect.
// ============================================================
import { KiteTicker as KiteTickerLib } from 'kiteconnect';
import type { Tick } from '../types';
import { config } from '../config';

type TickCallback = (ticks: Tick[]) => void;
type ConnectCallback = () => void;
type DisconnectCallback = (error?: Error) => void;

class TickerClient {
  private ticker: InstanceType<typeof KiteTickerLib> | null = null;
  private subscribedTokens: Set<number> = new Set();
  private tickCallbacks: TickCallback[] = [];
  private connectCallbacks: ConnectCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];
  private disconnectedAt: Date | null = null;
  private reconnectAlertSent = false;
  private marketHoursChecker: NodeJS.Timeout | null = null;
  private telegramAlertFn: ((msg: string) => Promise<void>) | null = null;

  /** Register a Telegram alert callback for WebSocket events. */
  setTelegramAlertFn(fn: (msg: string) => Promise<void>): void {
    this.telegramAlertFn = fn;
  }

  /** Initialize the KiteTicker with auth credentials. */
  initialize(apiKey: string, accessToken: string): void {
    this.ticker = new KiteTickerLib({
      api_key: apiKey,
      access_token: accessToken,
      reconnect: true,
      max_reconnect: 50,
      reconnect_interval: 5,
    } as ConstructorParameters<typeof KiteTickerLib>[0]);

    this.ticker.on('ticks', (rawTicks: unknown[]) => {
      const ticks: Tick[] = (rawTicks as Array<{ instrument_token: number; last_price: number; timestamp?: Date }>).map((t) => ({
        instrument_token: t.instrument_token,
        last_price: t.last_price,
        timestamp: t.timestamp instanceof Date ? t.timestamp : new Date(),
        volume: undefined,
      }));
      this.disconnectedAt = null;
      this.reconnectAlertSent = false;
      this.tickCallbacks.forEach((cb) => cb(ticks));
    });

    this.ticker.on('connect', () => {
      console.log('[Ticker] WebSocket connected.');
      this.disconnectedAt = null;
      this.reconnectAlertSent = false;
      this.connectCallbacks.forEach((cb) => cb());

      // Re-subscribe to all previously subscribed tokens
      if (this.subscribedTokens.size > 0) {
        this.subscribe(Array.from(this.subscribedTokens));
      }
    });

    this.ticker.on('disconnect', (error: Error) => {
      console.warn('[Ticker] WebSocket disconnected:', error?.message);
      this.disconnectedAt = new Date();
      this.disconnectCallbacks.forEach((cb) => cb(error));
      this.startDisconnectMonitor();
    });

    this.ticker.on('error', (error: Error) => {
      console.error('[Ticker] WebSocket error:', error?.message);
    });

    this.ticker.on('reconnect', (retries: number, interval: number) => {
      console.log(`[Ticker] Reconnecting... attempt ${retries}, interval: ${interval}s`);
    });

    this.ticker.on('noreconnect', () => {
      console.error('[Ticker] Max reconnect attempts reached. Please restart.');
      if (this.telegramAlertFn) {
        void this.telegramAlertFn(
          '🔴 *WebSocket Disconnected*\n\nMax reconnection attempts reached. ' +
          'Please restart the bot and re-authenticate.',
        );
      }
    });
  }

  /** Start monitoring for extended disconnections during market hours. */
  private startDisconnectMonitor(): void {
    if (this.marketHoursChecker) return;

    this.marketHoursChecker = setInterval(() => {
      if (!this.disconnectedAt) {
        clearInterval(this.marketHoursChecker!);
        this.marketHoursChecker = null;
        return;
      }

      if (!this.isMarketHours()) return;

      const disconnectedForMs = Date.now() - this.disconnectedAt.getTime();
      if (disconnectedForMs >= 30_000 && !this.reconnectAlertSent) {
        this.reconnectAlertSent = true;
        const seconds = Math.round(disconnectedForMs / 1000);
        if (this.telegramAlertFn) {
          void this.telegramAlertFn(
            `⚠️ *WebSocket Disconnected for ${seconds}s*\n\n` +
            'Attempting to reconnect. Strategy evaluation is paused.',
          );
        }
      }
    }, 5_000);
  }

  private isMarketHours(): boolean {
    const now = new Date();
    // IST = UTC + 5:30
    const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
    const ist = new Date(istMs);
    const hours = ist.getUTCHours();
    const minutes = ist.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;
    const marketOpen = 9 * 60 + 15; // 09:15
    const marketClose = 15 * 60 + 30; // 15:30
    return totalMinutes >= marketOpen && totalMinutes <= marketClose;
  }

  /** Connect the WebSocket. */
  connect(): void {
    if (!this.ticker) throw new Error('[Ticker] Not initialized. Call initialize() first.');
    this.ticker.connect();
  }

  /** Subscribe to an array of instrument tokens. */
  subscribe(tokens: number[]): void {
    if (!this.ticker) return;
    tokens.forEach((t) => this.subscribedTokens.add(t));
    this.ticker.subscribe(tokens);
    this.ticker.setMode(this.ticker.modeLTP, tokens);
  }

  /** Unsubscribe from specific tokens. */
  unsubscribe(tokens: number[]): void {
    if (!this.ticker) return;
    tokens.forEach((t) => this.subscribedTokens.delete(t));
    this.ticker.unsubscribe(tokens);
  }

  /** Unsubscribe from a token only if no other rules need it. */
  unsubscribeIfUnused(token: number, usedTokens: Set<number>): void {
    if (!usedTokens.has(token)) {
      this.unsubscribe([token]);
    }
  }

  onTick(cb: TickCallback): void { this.tickCallbacks.push(cb); }
  onConnect(cb: ConnectCallback): void { this.connectCallbacks.push(cb); }
  onDisconnect(cb: DisconnectCallback): void { this.disconnectCallbacks.push(cb); }

  getSubscribedTokens(): number[] {
    return Array.from(this.subscribedTokens);
  }

  disconnect(): void {
    this.ticker?.disconnect();
  }
}

export const tickerClient = new TickerClient();

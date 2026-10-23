// ============================================================
// Trade Master – Zerodha OAuth Express Server
// ============================================================
import express, { Request, Response } from 'express';
import { KiteConnect } from 'kiteconnect';
import { config } from '../config';
import { writeSession } from '../storage/storage';

let kiteInstance: KiteConnect | null = null;
let telegramNotifyFn: ((msg: string) => Promise<void>) | null = null;
let authSuccessCallback: ((accessToken: string) => Promise<void>) | null = null;

/**
 * Register a callback to send Telegram notifications from auth events.
 */
export function registerTelegramNotifier(fn: (msg: string) => Promise<void>): void {
  telegramNotifyFn = fn;
}

/**
 * Register a callback to initialize or re-initialize trading engine after successful OAuth.
 */
export function registerAuthSuccessHandler(fn: (accessToken: string) => Promise<void>): void {
  authSuccessCallback = fn;
}

/**
 * Get or create the KiteConnect instance.
 */
export function getKiteInstance(): KiteConnect {
  if (!kiteInstance) {
    kiteInstance = new KiteConnect({ api_key: config.kiteApiKey });
  }
  return kiteInstance;
}

/**
 * Set access token on the existing kite instance (called after OAuth).
 */
export function setAccessToken(token: string): void {
  getKiteInstance().setAccessToken(token);
}

/**
 * Create and return the Express auth router.
 */
export function createAuthRouter(): express.Router {
  const router = express.Router();

  // GET /login – redirect user to Zerodha login page
  router.get('/login', (_req: Request, res: Response) => {
    const kite = getKiteInstance();
    const loginUrl = kite.getLoginURL();
    res.redirect(loginUrl);
  });

  // GET /callback – exchange request_token for access_token
  router.get('/callback', async (req: Request, res: Response) => {
    const { request_token, status } = req.query as Record<string, string>;

    if (status === 'rejected' || !request_token) {
      res.status(400).send('<h2>❌ Login failed or cancelled. Please try again.</h2>');
      return;
    }

    try {
      const kite = getKiteInstance();
      const session = await kite.generateSession(request_token, config.kiteApiSecret);

      // Persist session to disk
      writeSession({
        access_token: session.access_token,
        public_token: session.public_token,
        login_time: new Date().toISOString(),
      });

      // Apply token to the live kite instance
      kite.setAccessToken(session.access_token);

      // Trigger engine initialization callback if registered
      if (authSuccessCallback) {
        try {
          await authSuccessCallback(session.access_token);
        } catch (subsysErr) {
          console.error('[Auth] Subsystems initialization error:', subsysErr);
        }
      }

      // Notify via Telegram
      if (telegramNotifyFn) {
        await telegramNotifyFn(
          '✅ *Zerodha Authentication Successful*\n\n' +
          'Strategy engine initialized and ready to monitor markets.',
        );
      }

      res.send(
        '<h2>✅ Zerodha Authentication Successful!</h2>' +
        '<p>You can close this tab and return to Telegram.</p>',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Auth] Session generation failed:', message);

      if (telegramNotifyFn) {
        await telegramNotifyFn(`❌ *Zerodha Auth Failed*\n\nError: ${message}`);
      }

      res.status(500).send(`<h2>❌ Authentication Error</h2><pre>${message}</pre>`);
    }
  });

  return router;
}

/**
 * Create and start the Express HTTP server.
 */
export function startAuthServer(): void {
  const app = express();

  app.use(createAuthRouter());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(config.port, () => {
    console.log(`[Auth] HTTP server running on http://localhost:${config.port}`);
    console.log(`[Auth] Login URL: http://localhost:${config.port}/login`);
  });
}

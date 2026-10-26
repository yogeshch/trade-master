// ============================================================
// Trade Master – Session Manager
// Loads persisted token on startup and validates freshness.
// ============================================================
import { readSession } from '../storage/storage';
import { getKiteInstance, setAccessToken } from './authServer';

/**
 * Returns true if the persisted session was created during the current trading session.
 * Zerodha access tokens expire daily at 7:30 AM IST (02:00 AM UTC).
 */
export function isSessionFresh(loginTime: string): boolean {
  if (!loginTime) return false;
  const loginDate = new Date(loginTime);
  const now = new Date();
  const diffMs = now.getTime() - loginDate.getTime();

  // If timestamp is invalid or older than 24 hours, stale
  if (isNaN(loginDate.getTime()) || diffMs < -60000 || diffMs > 24 * 60 * 60 * 1000) {
    return false;
  }

  // Zerodha tokens reset daily at 07:30 AM IST (02:00 UTC).
  // Determine the most recent 7:30 AM IST cutoff:
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const nowIST = new Date(now.getTime() + istOffsetMs);

  const todayCutoffIST = new Date(nowIST);
  todayCutoffIST.setUTCHours(7, 30, 0, 0);

  let lastResetIST: Date;
  if (nowIST.getTime() >= todayCutoffIST.getTime()) {
    lastResetIST = todayCutoffIST;
  } else {
    lastResetIST = new Date(todayCutoffIST.getTime() - 24 * 60 * 60 * 1000);
  }

  const loginIST = new Date(loginDate.getTime() + istOffsetMs);
  return loginIST.getTime() >= lastResetIST.getTime();
}

/**
 * Attempt to restore a valid session from disk.
 * Returns true if a fresh session was found and applied.
 */
export function restoreSession(): boolean {
  const session = readSession();

  if (!session) {
    console.log('[Session] No session found. Please authenticate via /login.');
    return false;
  }

  if (!isSessionFresh(session.login_time)) {
    console.log('[Session] Session is stale. Please re-authenticate via /login.');
    return false;
  }

  setAccessToken(session.access_token);
  console.log('[Session] Session restored successfully. Access token applied.');
  return true;
}

/**
 * Check if the session is currently authenticated and fresh.
 */
export function isAuthenticated(): boolean {
  const session = readSession();
  return session !== null && isSessionFresh(session.login_time);
}

/**
 * Get the current access token from disk, or null if unavailable.
 */
export function getAccessToken(): string | null {
  const session = readSession();
  if (!session || !isSessionFresh(session.login_time)) return null;
  return session.access_token;
}

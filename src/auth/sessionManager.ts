// ============================================================
// Trade Master – Session Manager
// Loads persisted token on startup and validates freshness.
// ============================================================
import { readSession } from '../storage/storage';
import { getKiteInstance, setAccessToken } from './authServer';

/**
 * Returns true if the persisted session was created today (IST).
 */
function isSessionFresh(loginTime: string): boolean {
  const loginDate = new Date(loginTime);
  const now = new Date();

  // Compare date strings in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const loginIST = new Date(loginDate.getTime() + istOffset);
  const nowIST = new Date(now.getTime() + istOffset);

  return (
    loginIST.getUTCFullYear() === nowIST.getUTCFullYear() &&
    loginIST.getUTCMonth() === nowIST.getUTCMonth() &&
    loginIST.getUTCDate() === nowIST.getUTCDate()
  );
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
    console.log('[Session] Session is stale (from a previous day). Please re-authenticate.');
    return false;
  }

  setAccessToken(session.access_token);
  console.log('[Session] Session restored successfully. Access token applied.');
  return true;
}

/**
 * Check if the kite instance currently has an access token set.
 * (Lightweight liveness check - does not make an API call.)
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

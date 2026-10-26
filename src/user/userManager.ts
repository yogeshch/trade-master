// ============================================================
// Trade Master – User & Funds Manager
// Fetches profile and margin/funds details from Kite Connect.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { getKiteInstance } from '../auth/authServer';
import { getAccessToken } from '../auth/sessionManager';
import type { UserProfile, UserMargins } from '../types';

class UserManager {
  private kite: KiteConnect | null = null;

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

  /**
   * Fetch authenticated user's profile information.
   */
  async getProfile(): Promise<UserProfile> {
    const kite = this.ensureKite();
    try {
      const profile = await kite.getProfile();
      return profile as unknown as UserProfile;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[UserManager] Failed to fetch profile:', message);
      throw err;
    }
  }

  /**
   * Fetch funds / margin details across equity and commodity segments.
   */
  async getMargins(segment?: string): Promise<UserMargins> {
    const kite = this.ensureKite();
    try {
      const margins = await kite.getMargins(segment);
      return margins as unknown as UserMargins;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[UserManager] Failed to fetch margins:', message);
      throw err;
    }
  }
}

export const userManager = new UserManager();

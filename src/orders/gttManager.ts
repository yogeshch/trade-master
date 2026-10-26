// ============================================================
// Trade Master – GTT (Good Till Triggered) Order Manager
// Handles listing, creation, and cancellation of GTT triggers.
// ============================================================
import { KiteConnect } from 'kiteconnect';
import { getKiteInstance } from '../auth/authServer';
import { getAccessToken } from '../auth/sessionManager';
import type { GTTTrigger, CreateGTTParams } from '../types';

class GTTManager {
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
   * Fetch all active and past GTT triggers.
   */
  async getGTTs(): Promise<GTTTrigger[]> {
    const kite = this.ensureKite();
    try {
      const raw = await kite.getGTTs();
      return (raw as unknown as GTTTrigger[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[GTTManager] Failed to fetch GTT triggers:', message);
      throw err;
    }
  }

  /**
   * Fetch details of a single GTT trigger by ID.
   */
  async getGTT(triggerId: number): Promise<GTTTrigger | null> {
    const kite = this.ensureKite();
    try {
      const res = await kite.getGTT(triggerId);
      return (res as unknown as GTTTrigger) ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[GTTManager] Failed to fetch GTT trigger ${triggerId}:`, message);
      return null;
    }
  }

  /**
   * Place a new GTT trigger.
   */
  async placeGTT(params: CreateGTTParams): Promise<{ trigger_id: number }> {
    const kite = this.ensureKite();
    try {
      const res = await kite.placeGTT(params);
      return res as { trigger_id: number };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[GTTManager] Failed to place GTT trigger:', message);
      throw err;
    }
  }

  /**
   * Delete an active GTT trigger by ID.
   */
  async deleteGTT(triggerId: number): Promise<boolean> {
    const kite = this.ensureKite();
    try {
      await kite.deleteGTT(triggerId);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[GTTManager] Failed to delete GTT trigger ${triggerId}:`, message);
      return false;
    }
  }
}

export const gttManager = new GTTManager();

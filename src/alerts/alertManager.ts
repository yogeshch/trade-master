// ============================================================
// Trade Master – Alerts Manager
// Handles Kite Connect alerts API (/alerts).
// ============================================================
import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { getAccessToken } from '../auth/sessionManager';
import type { KiteAlert, CreateAlertParams, ModifyAlertParams, AlertHistoryItem } from '../types';

class AlertManager {
  private baseURL = 'https://api.kite.trade';

  private getClient(): AxiosInstance {
    const token = getAccessToken();
    if (!token) {
      throw new Error('[AlertManager] Not authenticated. Access token missing.');
    }

    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${config.kiteApiKey}:${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    });
  }

  /**
   * Retrieve all alerts for the authenticated user.
   */
  async getAlerts(): Promise<KiteAlert[]> {
    try {
      const client = this.getClient();
      const res = await client.get('/alerts');
      return (res.data?.data as KiteAlert[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AlertManager] Failed to fetch alerts:', message);
      throw err;
    }
  }

  /**
   * Retrieve a specific alert by UUID.
   */
  async getAlert(uuid: string): Promise<KiteAlert | null> {
    try {
      const client = this.getClient();
      const res = await client.get(`/alerts/${encodeURIComponent(uuid)}`);
      return (res.data?.data as KiteAlert) ?? null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AlertManager] Failed to fetch alert ${uuid}:`, message);
      return null;
    }
  }

  /**
   * Create a new alert.
   */
  async createAlert(params: CreateAlertParams): Promise<KiteAlert> {
    try {
      const client = this.getClient();
      const payload: Record<string, string> = {
        name: params.name,
        lhs: params.lhs,
        operator: params.operator,
        rhs: String(params.rhs),
      };
      if (params.type) payload['type'] = params.type;

      const res = await client.post('/alerts', new URLSearchParams(payload).toString());
      return res.data?.data as KiteAlert;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[AlertManager] Failed to create alert:', message);
      throw err;
    }
  }

  /**
   * Modify an existing alert.
   */
  async modifyAlert(uuid: string, params: ModifyAlertParams): Promise<boolean> {
    try {
      const client = this.getClient();
      const payload: Record<string, string> = {};
      if (params.name) payload['name'] = params.name;
      if (params.lhs) payload['lhs'] = params.lhs;
      if (params.operator) payload['operator'] = params.operator;
      if (params.rhs !== undefined) payload['rhs'] = String(params.rhs);
      if (params.status) payload['status'] = params.status;

      const res = await client.put(`/alerts/${encodeURIComponent(uuid)}`, new URLSearchParams(payload).toString());
      return res.data?.status === 'success';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AlertManager] Failed to modify alert ${uuid}:`, message);
      throw err;
    }
  }

  /**
   * Delete an alert by UUID.
   */
  async deleteAlert(uuid: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const res = await client.delete(`/alerts?uuid=${encodeURIComponent(uuid)}`);
      return res.data?.status === 'success';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AlertManager] Failed to delete alert ${uuid}:`, message);
      throw err;
    }
  }

  /**
   * Retrieve trigger history of a specific alert.
   */
  async getAlertHistory(uuid: string): Promise<AlertHistoryItem[]> {
    try {
      const client = this.getClient();
      const res = await client.get(`/alerts/${encodeURIComponent(uuid)}/history`);
      return (res.data?.data as AlertHistoryItem[]) ?? [];
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AlertManager] Failed to fetch alert history for ${uuid}:`, message);
      throw err;
    }
  }
}

export const alertManager = new AlertManager();

// ============================================================
// Trade Master – Atomic JSON Storage Helpers
// ============================================================
import fs from 'fs';
import path from 'path';

const CONFIG_DIR = path.resolve(__dirname, '../../config');

/**
 * Atomically reads a JSON file from the config directory.
 * If file does not exist and defaultValue is provided, returns defaultValue.
 */
export function readConfig<T>(filename: string, defaultValue?: T): T {
  const filePath = path.join(CONFIG_DIR, filename);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw err;
  }
}

/**
 * Atomically writes a JSON object to the config directory.
 * Uses a temp-file + rename pattern to prevent corruption.
 */
export function writeConfig<T>(filename: string, data: T): void {
  const filePath = path.join(CONFIG_DIR, filename);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ------------------------------------
// Session token helpers
// ------------------------------------
const SESSION_FILE = path.resolve(__dirname, '../../config/session.json');

export function readSession(): { access_token: string; public_token: string; login_time: string } | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSession(data: { access_token: string; public_token: string; login_time: string }): void {
  const tmpPath = SESSION_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, SESSION_FILE);
}

export function clearSession(): void {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch {
    // no-op if file doesn't exist
  }
}

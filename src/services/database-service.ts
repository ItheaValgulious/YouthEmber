import { Preferences } from '@capacitor/preferences';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

import type { AppState } from '../types/models';
import { isNativePlatform } from './capacitor/runtime';

const DATABASE_NAME = 'ashdairy';
const APP_STATE_KEY = 'app_state';
const KEY_PREFIX = 'ashdairy:kv:';

interface KeyValueDriver {
  readonly label: string;
  initialize(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

class PreferencesDriver implements KeyValueDriver {
  readonly label = 'Capacitor Preferences';

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async get(key: string): Promise<string | null> {
    const result = await Preferences.get({ key: `${KEY_PREFIX}${key}` });
    return result.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key: `${KEY_PREFIX}${key}`, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key: `${KEY_PREFIX}${key}` });
  }
}

class SQLiteDriver implements KeyValueDriver {
  readonly label = 'Capacitor SQLite';

  private db: SQLiteDBConnection | null = null;

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    const sqliteModule = await import('@capacitor-community/sqlite');
    const sqlite = new sqliteModule.SQLiteConnection(sqliteModule.CapacitorSQLite);
    const consistency = await sqlite.checkConnectionsConsistency();
    const isConnection = (await sqlite.isConnection(DATABASE_NAME, false)).result;

    this.db =
      consistency.result && isConnection
        ? await sqlite.retrieveConnection(DATABASE_NAME, false)
        : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);

    await this.db.open();
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private async getDb(): Promise<SQLiteDBConnection> {
    await this.initialize();
    if (!this.db) {
      throw new Error('SQLite 数据库初始化失败');
    }

    return this.db;
  }

  async get(key: string): Promise<string | null> {
    const db = await this.getDb();
    const result = await db.query('SELECT value FROM kv_store WHERE key = ? LIMIT 1;', [key]);
    const row = result.values?.[0] as { value?: string } | undefined;
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.getDb();
    await db.run('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?);', [
      key,
      value,
      new Date().toISOString(),
    ]);
  }

  async remove(key: string): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM kv_store WHERE key = ?;', [key]);
  }
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export class DatabaseService {
  private driver: KeyValueDriver | null = null;

  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.driver = isNativePlatform() ? new SQLiteDriver() : new PreferencesDriver();
    await this.driver.initialize();
    this.initialized = true;
  }

  get driverLabel(): string {
    return this.driver?.label ?? 'Uninitialized';
  }

  private async ensureDriver(): Promise<KeyValueDriver> {
    await this.initialize();
    if (!this.driver) {
      throw new Error('数据库驱动不可用');
    }

    return this.driver;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const driver = await this.ensureDriver();
    return parseJson<T>(await driver.get(key));
  }

  async setJson(key: string, value: unknown): Promise<void> {
    const driver = await this.ensureDriver();
    await driver.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    const driver = await this.ensureDriver();
    await driver.remove(key);
  }

  async loadAppState(): Promise<AppState | null> {
    return this.getJson<AppState>(APP_STATE_KEY);
  }

  async saveAppState(state: AppState): Promise<void> {
    await this.setJson(APP_STATE_KEY, state);
  }
}

export const databaseService = new DatabaseService();

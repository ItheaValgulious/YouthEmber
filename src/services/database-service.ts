import type { SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

import { normalizeLabel } from '../lib/tag';
import type {
  AppConfig,
  AppState,
  EventRecord,
  FriendRecord,
  MailRecord,
  ModelRecord,
  PendingAiJob,
  SummaryRecord,
  Tag,
  TaskStatus,
} from '../types/models';
import { isNativePlatform, isWebPlatform } from './capacitor/runtime';

const DATABASE_NAME = 'ashdairy';
const DATABASE_VERSION = 1;
const TASK_STATUS_VALUES = new Set<Exclude<TaskStatus, null>>(['ongoing', 'finished', 'not_finished']);
const APP_META_KEYS = {
  token: 'auth.token',
  authUserId: 'auth.user_id',
  authUsername: 'auth.username',
  authExpiresAt: 'auth.expires_at',
  lastSummaryCheck: 'app.last_summary_check',
  lastOpenedMyPanel: 'app.last_opened_my_panel',
} as const;

type JsonRecord = Record<string, unknown>;
type QueryRow = Record<string, unknown>;

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function isTaskStatus(value: unknown): value is Exclude<TaskStatus, null> {
  return typeof value === 'string' && TASK_STATUS_VALUES.has(value as Exclude<TaskStatus, null>);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

interface PersistedMetaState {
  token: string;
  auth_user_id: string;
  auth_username: string;
  auth_expires_at: string | null;
  last_summary_check: string | null;
  last_opened_my_panel: AppState['last_opened_my_panel'];
}

async function ensureWebComponent(): Promise<void> {
  if (!isWebPlatform() || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);

  if (!document.querySelector('jeep-sqlite')) {
    throw new Error('Missing <jeep-sqlite> element in index.html.');
  }
}

export class DatabaseService {
  private sqlite: SQLiteConnection | null = null;

  private db: SQLiteDBConnection | null = null;

  private initialized = false;

  private initializationPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      if (isWebPlatform()) {
        await ensureWebComponent();
      }

      const sqliteModule = await import('@capacitor-community/sqlite');
      this.sqlite = new sqliteModule.SQLiteConnection(sqliteModule.CapacitorSQLite);

      if (isWebPlatform()) {
        await this.sqlite.initWebStore();
      }

      const consistency = await this.sqlite.checkConnectionsConsistency();
      const isConnection = (await this.sqlite.isConnection(DATABASE_NAME, false)).result;

      this.db =
        consistency.result && isConnection
          ? await this.sqlite.retrieveConnection(DATABASE_NAME, false)
          : await this.sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false);

      await this.db.open();
      await this.db.execute('PRAGMA foreign_keys = ON;');
      await this.ensureSchema();
      this.initialized = true;
    })();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  get driverLabel(): string {
    if (!this.initialized) {
      return 'Uninitialized';
    }

    return isNativePlatform() ? 'Capacitor SQLite (Native)' : 'Capacitor SQLite (Web IndexedDB)';
  }

  private async getDb(): Promise<SQLiteDBConnection> {
    await this.initialize();
    if (!this.db) {
      throw new Error('SQLite connection is not available.');
    }

    return this.db;
  }

  private async ensureSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('SQLite connection is not available during schema setup.');
    }

    const db = this.db;
    await db.execute(`
      DROP TABLE IF EXISTS kv_store;

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_config (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        timezone TEXT NOT NULL,
        pre_alert INTEGER NOT NULL,
        alert_time TEXT NOT NULL,
        abstract_show_content_length INTEGER NOT NULL,
        abstract_show_picture_count INTEGER NOT NULL,
        abstract_show_tag_count INTEGER NOT NULL,
        abstract_show_comment_count INTEGER NOT NULL,
        page_margin INTEGER NOT NULL,
        diary_paper_size TEXT NOT NULL,
        diary_font_scale REAL NOT NULL,
        summary_intervals_json TEXT NOT NULL,
        mood_weights_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        memory_path TEXT NOT NULL,
        soul TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        active REAL NOT NULL,
        ai_active REAL NOT NULL,
        latency REAL NOT NULL,
        enabled INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        type TEXT NOT NULL,
        rules TEXT NOT NULL,
        system INTEGER NOT NULL,
        payload_json TEXT NULL,
        last_used_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(type, normalized_label)
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        time TEXT NULL,
        title TEXT NOT NULL,
        raw TEXT NOT NULL,
        is_task INTEGER NOT NULL,
        task_status TEXT NULL CHECK (task_status IN ('ongoing', 'finished', 'not_finished')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS event_tags (
        event_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (event_id, tag_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS event_assets (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filename TEXT NULL,
        type TEXT NOT NULL,
        upload_order INTEGER NOT NULL,
        mime_type TEXT NULL,
        size_bytes INTEGER NULL,
        width INTEGER NULL,
        height INTEGER NULL,
        duration_ms INTEGER NULL,
        thumbnail_path TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        content TEXT NOT NULL,
        sender TEXT NOT NULL,
        time TEXT NOT NULL,
        attitude REAL NULL,
        reply_to_comment_id TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mails (
        id TEXT PRIMARY KEY NOT NULL,
        time TEXT NOT NULL,
        title TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        summary_interval TEXT NULL,
        summary_range_start TEXT NULL,
        summary_range_end TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL,
        interval TEXT NOT NULL,
        range_start TEXT NOT NULL,
        range_end TEXT NOT NULL,
        task_finished INTEGER NOT NULL,
        task_failed INTEGER NOT NULL,
        task_rest INTEGER NOT NULL,
        task_rate REAL NOT NULL,
        task_summary TEXT NOT NULL,
        mood_total REAL NOT NULL,
        mood_summary TEXT NOT NULL,
        mood_event_track_json TEXT NOT NULL,
        mood_daily_totals_json TEXT NOT NULL,
        mood_monthly_averages_json TEXT NOT NULL,
        summary TEXT NOT NULL,
        title TEXT NOT NULL,
        mail_id TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL,
        UNIQUE(interval, range_end)
      );

      CREATE TABLE IF NOT EXISTS ai_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        run_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL,
        resume_status TEXT NULL,
        client_request_id TEXT NULL,
        remote_task_id TEXT NULL,
        remote_status TEXT NULL,
        remote_error_code TEXT NULL,
        remote_response TEXT NULL,
        remote_created_at TEXT NULL,
        remote_started_at TEXT NULL,
        remote_finished_at TEXT NULL,
        payload_json TEXT NOT NULL,
        last_error TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_task ON events(is_task, task_status, time);
      CREATE INDEX IF NOT EXISTS idx_event_assets_event ON event_assets(event_id, upload_order);
      CREATE INDEX IF NOT EXISTS idx_comments_event ON comments(event_id, time);
      CREATE INDEX IF NOT EXISTS idx_event_tags_tag_event ON event_tags(tag_id, event_id);
      CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_run_at ON ai_jobs(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_friends_sort_order ON friends(sort_order);
      CREATE INDEX IF NOT EXISTS idx_models_sort_order ON models(sort_order);
      CREATE INDEX IF NOT EXISTS idx_tags_type_last_used_at ON tags(type, last_used_at);

      PRAGMA user_version = 1;
    `);

    await this.flushWebStore();
  }

  private async withTransaction(task: (db: SQLiteDBConnection) => Promise<void>): Promise<void> {
    const db = await this.getDb();
    await db.beginTransaction();

    try {
      await task(db);
      await db.commitTransaction();
      await this.flushWebStore();
    } catch (error) {
      try {
        await db.rollbackTransaction();
      } catch {
        // Some web drivers auto-close failed transactions before rollback is attempted.
      }
      throw error;
    }
  }

  private async flushWebStore(): Promise<void> {
    if (!isWebPlatform() || !this.sqlite) {
      return;
    }

    await this.sqlite.saveToStore(DATABASE_NAME);
  }

  private async run(db: SQLiteDBConnection, statement: string, values: unknown[] = []): Promise<void> {
    await db.run(statement, values, false);
  }

  private async setJsonEntries(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    if (!entries.length) {
      return;
    }

    await this.withTransaction(async (db) => {
      const now = new Date().toISOString();
      for (const entry of entries) {
        await this.run(
          db,
          'INSERT OR REPLACE INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?);',
          [entry.key, stringifyJson(entry.value), now],
        );
      }
    });
  }

  private async removeMetaEntries(keys: string[]): Promise<void> {
    if (!keys.length) {
      return;
    }

    await this.withTransaction(async (db) => {
      for (const key of keys) {
        await this.run(db, 'DELETE FROM app_meta WHERE key = ?;', [key]);
      }
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    const db = await this.getDb();
    const result = await db.query('SELECT value_json FROM app_meta WHERE key = ? LIMIT 1;', [key]);
    const row = result.values?.[0] as QueryRow | undefined;
    return parseJson<T>(typeof row?.value_json === 'string' ? row.value_json : null);
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.setJsonEntries([{ key, value }]);
  }

  async remove(key: string): Promise<void> {
    await this.removeMetaEntries([key]);
  }

  async clearAppMeta(): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.run(db, 'DELETE FROM app_meta;');
    });
  }

  async loadState(): Promise<AppState | null> {
    const db = await this.getDb();
    const configResult = await db.query('SELECT * FROM app_config WHERE id = 1 LIMIT 1;');
    const configRow = configResult.values?.[0] as QueryRow | undefined;

    if (!configRow) {
      return null;
    }

    const modelsRows = (await db.query('SELECT id, name FROM models ORDER BY sort_order ASC;')).values as QueryRow[] | undefined;
    const friendsRows = (await db.query('SELECT * FROM friends ORDER BY sort_order ASC;')).values as QueryRow[] | undefined;
    const tagsRows = (await db.query('SELECT * FROM tags ORDER BY type ASC, label ASC;')).values as QueryRow[] | undefined;
    const eventsRows = (await db.query('SELECT * FROM events ORDER BY created_at ASC;')).values as QueryRow[] | undefined;
    const eventTagRows = (await db.query(`
      SELECT
        event_tags.event_id AS event_id,
        event_tags.sort_order AS sort_order,
        tags.id AS id,
        tags.label AS label,
        tags.type AS type,
        tags.rules AS rules,
        tags.system AS system,
        tags.payload_json AS payload_json,
        tags.last_used_at AS last_used_at
      FROM event_tags
      INNER JOIN tags ON tags.id = event_tags.tag_id
      ORDER BY event_tags.event_id ASC, event_tags.sort_order ASC;
    `)).values as QueryRow[] | undefined;
    const assetRows = (await db.query('SELECT * FROM event_assets ORDER BY event_id ASC, upload_order ASC;')).values as QueryRow[] | undefined;
    const commentRows = (await db.query('SELECT * FROM comments ORDER BY event_id ASC, time ASC;')).values as QueryRow[] | undefined;
    const mailRows = (await db.query('SELECT * FROM mails ORDER BY time ASC;')).values as QueryRow[] | undefined;
    const summaryRows = (await db.query('SELECT * FROM summaries ORDER BY range_end ASC;')).values as QueryRow[] | undefined;
    const aiJobRows = (await db.query('SELECT * FROM ai_jobs ORDER BY run_at ASC;')).values as QueryRow[] | undefined;

    const eventTagsByEventId = new Map<string, Tag[]>();
    for (const row of eventTagRows ?? []) {
      const eventId = asString(row.event_id);
      const list = eventTagsByEventId.get(eventId) ?? [];
      list.push({
        id: asString(row.id),
        label: asString(row.label),
        type: asString(row.type, 'others') as Tag['type'],
        rules: asString(row.rules),
        system: asBoolean(row.system),
        payload: parseJson<Tag['payload']>(asNullableString(row.payload_json) ?? undefined) ?? null,
        last_used_at: asNullableString(row.last_used_at),
      });
      eventTagsByEventId.set(eventId, list);
    }

    const assetsByEventId = new Map<string, EventRecord['assets']>();
    for (const row of assetRows ?? []) {
      const eventId = asString(row.event_id);
      const list = assetsByEventId.get(eventId) ?? [];
      list.push({
        id: asString(row.id),
        filepath: asString(row.filepath),
        filename: asNullableString(row.filename) ?? undefined,
        type: asString(row.type, 'image') as EventRecord['assets'][number]['type'],
        upload_order: asNumber(row.upload_order),
        mime_type: asNullableString(row.mime_type) ?? undefined,
        size_bytes: asNullableNumber(row.size_bytes) ?? undefined,
        width: asNullableNumber(row.width) ?? undefined,
        height: asNullableNumber(row.height) ?? undefined,
        duration_ms: asNullableNumber(row.duration_ms) ?? undefined,
        thumbnail_path: asNullableString(row.thumbnail_path) ?? undefined,
      });
      assetsByEventId.set(eventId, list);
    }

    const commentsByEventId = new Map<string, EventRecord['comments']>();
    for (const row of commentRows ?? []) {
      const eventId = asString(row.event_id);
      const list = commentsByEventId.get(eventId) ?? [];
      list.push({
        id: asString(row.id),
        content: asString(row.content),
        sender: asString(row.sender),
        time: asString(row.time),
        attitude: asNullableNumber(row.attitude) ?? undefined,
        reply_to_comment_id: asNullableString(row.reply_to_comment_id) ?? undefined,
      });
      commentsByEventId.set(eventId, list);
    }

    return {
      schema_version: 1,
      config: {
        timezone: asString(configRow.timezone),
        pre_alert: asNumber(configRow.pre_alert),
        alert_time: asString(configRow.alert_time),
        abstract_show_content_length: asNumber(configRow.abstract_show_content_length),
        abstract_show_picture_count: asNumber(configRow.abstract_show_picture_count),
        abstract_show_tag_count: asNumber(configRow.abstract_show_tag_count),
        abstract_show_comment_count: asNumber(configRow.abstract_show_comment_count),
        page_margin: asNumber(configRow.page_margin),
        diary_paper_size: asString(configRow.diary_paper_size, 'B5') as AppConfig['diary_paper_size'],
        diary_font_scale: asNumber(configRow.diary_font_scale, 1),
        summary_intervals:
          parseJson<AppConfig['summary_intervals']>(asString(configRow.summary_intervals_json)) ?? ['7d', '3m', '1y'],
        mood_weights: parseJson<AppConfig['mood_weights']>(asString(configRow.mood_weights_json)) ?? {},
      },
      token: (await this.getJson<string>(APP_META_KEYS.token)) ?? '',
      auth_user_id: (await this.getJson<string>(APP_META_KEYS.authUserId)) ?? '',
      auth_username: (await this.getJson<string>(APP_META_KEYS.authUsername)) ?? '',
      auth_expires_at: (await this.getJson<string | null>(APP_META_KEYS.authExpiresAt)) ?? null,
      models: (modelsRows ?? []).map((row) => ({
        id: asString(row.id),
        name: asString(row.name),
      })),
      friends: (friendsRows ?? []).map((row) => ({
        id: asString(row.id),
        name: asString(row.name),
        model_id: asString(row.model_id),
        memory_path: asString(row.memory_path),
        soul: asString(row.soul),
        system_prompt: asString(row.system_prompt),
        active: asNumber(row.active),
        ai_active: asNumber(row.ai_active),
        latency: asNumber(row.latency),
        enabled: asBoolean(row.enabled),
      })),
      tags: (tagsRows ?? []).map((row) => ({
        id: asString(row.id),
        label: asString(row.label),
        type: asString(row.type, 'others') as Tag['type'],
        rules: asString(row.rules),
        system: asBoolean(row.system),
        payload: parseJson<Tag['payload']>(asNullableString(row.payload_json) ?? undefined) ?? null,
        last_used_at: asNullableString(row.last_used_at),
      })),
      events: (eventsRows ?? []).map((row) => ({
        id: asString(row.id),
        created_at: asString(row.created_at),
        time: asNullableString(row.time),
        title: asString(row.title),
        raw: asString(row.raw),
        is_task: asBoolean(row.is_task),
        task_status: isTaskStatus(row.task_status) ? row.task_status : null,
        tags: eventTagsByEventId.get(asString(row.id)) ?? [],
        assets: assetsByEventId.get(asString(row.id)) ?? [],
        comments: commentsByEventId.get(asString(row.id)) ?? [],
      })),
      mails: (mailRows ?? []).map((row) => ({
        id: asString(row.id),
        time: asString(row.time),
        title: asString(row.title),
        sender: asString(row.sender),
        content: asString(row.content),
        summary_meta:
          asNullableString(row.summary_interval) && asNullableString(row.summary_range_start) && asNullableString(row.summary_range_end)
            ? {
                interval: asString(row.summary_interval) as SummaryRecord['interval'],
                range_start: asString(row.summary_range_start),
                range_end: asString(row.summary_range_end),
              }
            : undefined,
      })),
      summaries: (summaryRows ?? []).map((row) => ({
        id: asString(row.id),
        created_at: asString(row.created_at),
        interval: asString(row.interval, '7d') as SummaryRecord['interval'],
        range_start: asString(row.range_start),
        range_end: asString(row.range_end),
        tasks: {
          finished: asNumber(row.task_finished),
          failed: asNumber(row.task_failed),
          rest: asNumber(row.task_rest),
          rate: asNumber(row.task_rate),
          summary: asString(row.task_summary),
        },
        mood: {
          total: asNumber(row.mood_total),
          summary: asString(row.mood_summary),
          event_track: parseJson<SummaryRecord['mood']['event_track']>(asString(row.mood_event_track_json)) ?? [],
          daily_totals: parseJson<SummaryRecord['mood']['daily_totals']>(asString(row.mood_daily_totals_json)) ?? [],
          monthly_averages:
            parseJson<SummaryRecord['mood']['monthly_averages']>(asString(row.mood_monthly_averages_json)) ?? [],
        },
        summary: asString(row.summary),
        title: asString(row.title),
        mail_id: asString(row.mail_id),
      })),
      diary_book: null,
      ai_jobs: (aiJobRows ?? []).map((row) => ({
        id: asString(row.id),
        type: asString(row.type, 'enrich_event') as PendingAiJob['type'],
        status: asString(row.status, 'create_remote_task') as PendingAiJob['status'],
        run_at: asString(row.run_at),
        retry_count: asNumber(row.retry_count),
        resume_status: asNullableString(row.resume_status) as PendingAiJob['resume_status'],
        client_request_id: asNullableString(row.client_request_id) ?? undefined,
        remote_task_id: asNullableString(row.remote_task_id) ?? undefined,
        remote_status: asNullableString(row.remote_status) as PendingAiJob['remote_status'],
        remote_error_code: asNullableString(row.remote_error_code) ?? undefined,
        remote_response: asNullableString(row.remote_response) ?? undefined,
        remote_created_at: asNullableString(row.remote_created_at) ?? undefined,
        remote_started_at: asNullableString(row.remote_started_at) ?? undefined,
        remote_finished_at: asNullableString(row.remote_finished_at) ?? undefined,
        payload: parseJson<JsonRecord>(asString(row.payload_json)) ?? {},
        last_error: asNullableString(row.last_error) ?? undefined,
      })),
      last_summary_check: (await this.getJson<string | null>(APP_META_KEYS.lastSummaryCheck)) ?? null,
      last_opened_my_panel:
        ((await this.getJson<AppState['last_opened_my_panel']>(APP_META_KEYS.lastOpenedMyPanel)) as AppState['last_opened_my_panel']) ??
        'mailbox',
    };
  }

  async replaceState(state: AppState): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.resetStateTables(db);
      await this.writeConfig(db, state.config);
      await this.writeKnownMeta(db, {
        token: state.token,
        auth_user_id: state.auth_user_id,
        auth_username: state.auth_username,
        auth_expires_at: state.auth_expires_at,
        last_summary_check: state.last_summary_check,
        last_opened_my_panel: state.last_opened_my_panel,
      });
      await this.writeModelsAndFriends(db, state.models, state.friends);
      await this.writeTagsAndEvents(db, state.tags, state.events);
      await this.writeMailsAndSummaries(db, state.mails, state.summaries);
      await this.writeAiJobs(db, state.ai_jobs);
    });
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.writeConfig(db, config);
    });
  }

  async saveMetaState(meta: PersistedMetaState): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.writeKnownMeta(db, meta);
    });
  }

  async saveModelsAndFriends(models: ModelRecord[], friends: FriendRecord[]): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.run(db, 'DELETE FROM friends;');
      await this.run(db, 'DELETE FROM models;');
      await this.writeModelsAndFriends(db, models, friends);
    });
  }

  async saveTagsAndEvents(tags: Tag[], events: EventRecord[]): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.run(db, 'DELETE FROM event_tags;');
      await this.run(db, 'DELETE FROM event_assets;');
      await this.run(db, 'DELETE FROM comments;');
      await this.run(db, 'DELETE FROM events;');
      await this.run(db, 'DELETE FROM tags;');
      await this.writeTagsAndEvents(db, tags, events);
    });
  }

  async saveMailsAndSummaries(mails: MailRecord[], summaries: SummaryRecord[]): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.run(db, 'DELETE FROM summaries;');
      await this.run(db, 'DELETE FROM mails;');
      await this.writeMailsAndSummaries(db, mails, summaries);
    });
  }

  async saveAiJobs(aiJobs: PendingAiJob[]): Promise<void> {
    await this.withTransaction(async (db) => {
      await this.run(db, 'DELETE FROM ai_jobs;');
      await this.writeAiJobs(db, aiJobs);
    });
  }

  private async resetStateTables(db: SQLiteDBConnection): Promise<void> {
    await this.run(db, 'DELETE FROM event_tags;');
    await this.run(db, 'DELETE FROM event_assets;');
    await this.run(db, 'DELETE FROM comments;');
    await this.run(db, 'DELETE FROM events;');
    await this.run(db, 'DELETE FROM summaries;');
    await this.run(db, 'DELETE FROM mails;');
    await this.run(db, 'DELETE FROM ai_jobs;');
    await this.run(db, 'DELETE FROM friends;');
    await this.run(db, 'DELETE FROM models;');
    await this.run(db, 'DELETE FROM tags;');
    await this.run(db, 'DELETE FROM app_config;');
    await this.run(db, 'DELETE FROM app_meta;');
  }

  private async writeConfig(db: SQLiteDBConnection, config: AppConfig): Promise<void> {
    const now = new Date().toISOString();
    await this.run(
      db,
      `
        INSERT OR REPLACE INTO app_config (
          id,
          timezone,
          pre_alert,
          alert_time,
          abstract_show_content_length,
          abstract_show_picture_count,
          abstract_show_tag_count,
          abstract_show_comment_count,
          page_margin,
          diary_paper_size,
          diary_font_scale,
          summary_intervals_json,
          mood_weights_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        1,
        config.timezone,
        config.pre_alert,
        config.alert_time,
        config.abstract_show_content_length,
        config.abstract_show_picture_count,
        config.abstract_show_tag_count,
        config.abstract_show_comment_count,
        config.page_margin,
        config.diary_paper_size,
        config.diary_font_scale,
        stringifyJson(config.summary_intervals),
        stringifyJson(config.mood_weights),
        now,
      ],
    );
  }

  private async writeKnownMeta(db: SQLiteDBConnection, meta: PersistedMetaState): Promise<void> {
    const now = new Date().toISOString();
    const entries: Array<[string, unknown]> = [
      [APP_META_KEYS.token, meta.token],
      [APP_META_KEYS.authUserId, meta.auth_user_id],
      [APP_META_KEYS.authUsername, meta.auth_username],
      [APP_META_KEYS.authExpiresAt, meta.auth_expires_at],
      [APP_META_KEYS.lastSummaryCheck, meta.last_summary_check],
      [APP_META_KEYS.lastOpenedMyPanel, meta.last_opened_my_panel],
    ];

    for (const [key, value] of entries) {
      await this.run(
        db,
        'INSERT OR REPLACE INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?);',
        [key, stringifyJson(value), now],
      );
    }
  }

  private async writeModelsAndFriends(db: SQLiteDBConnection, models: ModelRecord[], friends: FriendRecord[]): Promise<void> {
    const now = new Date().toISOString();

    for (const [index, model] of models.entries()) {
      await this.run(db, 'INSERT INTO models (id, name, sort_order) VALUES (?, ?, ?);', [model.id, model.name, index]);
    }

    for (const [index, friend] of friends.entries()) {
      await this.run(
        db,
        `
          INSERT INTO friends (
            id,
            name,
            model_id,
            memory_path,
            soul,
            system_prompt,
            active,
            ai_active,
            latency,
            enabled,
            sort_order,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          friend.id,
          friend.name,
          friend.model_id,
          friend.memory_path,
          friend.soul,
          friend.system_prompt,
          friend.active,
          friend.ai_active,
          friend.latency,
          friend.enabled ? 1 : 0,
          index,
          now,
          now,
        ],
      );
    }
  }

  private async writeTagsAndEvents(db: SQLiteDBConnection, tags: Tag[], events: EventRecord[]): Promise<void> {
    const now = new Date().toISOString();

    for (const tag of tags) {
      await this.run(
        db,
        `
          INSERT INTO tags (
            id,
            label,
            normalized_label,
            type,
            rules,
            system,
            payload_json,
            last_used_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          tag.id,
          tag.label,
          normalizeLabel(tag.label),
          tag.type,
          tag.rules,
          tag.system ? 1 : 0,
          tag.payload ? stringifyJson(tag.payload) : null,
          tag.last_used_at ?? null,
          now,
          now,
        ],
      );
    }

    for (const event of events) {
      await this.run(
        db,
        `
          INSERT INTO events (
            id,
            created_at,
            time,
            title,
            raw,
            is_task,
            task_status,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          event.id,
          event.created_at,
          event.time,
          event.title,
          event.raw,
          event.is_task ? 1 : 0,
          event.task_status,
          now,
        ],
      );

      const runtimeTags = event.tags.filter((tag) => !this.isTaskSystemTag(tag));
      for (const [index, tag] of runtimeTags.entries()) {
        await this.run(
          db,
          'INSERT INTO event_tags (event_id, tag_id, sort_order, added_at) VALUES (?, ?, ?, ?);',
          [event.id, tag.id, index, now],
        );
      }

      for (const asset of event.assets) {
        await this.run(
          db,
          `
            INSERT INTO event_assets (
              id,
              event_id,
              filepath,
              filename,
              type,
              upload_order,
              mime_type,
              size_bytes,
              width,
              height,
              duration_ms,
              thumbnail_path,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            asset.id,
            event.id,
            asset.filepath,
            asset.filename ?? null,
            asset.type,
            asset.upload_order,
            asset.mime_type ?? null,
            asset.size_bytes ?? null,
            asset.width ?? null,
            asset.height ?? null,
            asset.duration_ms ?? null,
            asset.thumbnail_path ?? null,
            now,
          ],
        );
      }

      for (const comment of event.comments) {
        await this.run(
          db,
          `
            INSERT INTO comments (
              id,
              event_id,
              content,
              sender,
              time,
              attitude,
              reply_to_comment_id,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
          `,
          [
            comment.id,
            event.id,
            comment.content,
            comment.sender,
            comment.time,
            comment.attitude ?? null,
            comment.reply_to_comment_id ?? null,
            now,
          ],
        );
      }
    }
  }

  private async writeMailsAndSummaries(db: SQLiteDBConnection, mails: MailRecord[], summaries: SummaryRecord[]): Promise<void> {
    const now = new Date().toISOString();

    for (const mail of mails) {
      await this.run(
        db,
        `
          INSERT INTO mails (
            id,
            time,
            title,
            sender,
            content,
            summary_interval,
            summary_range_start,
            summary_range_end,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          mail.id,
          mail.time,
          mail.title,
          mail.sender,
          mail.content,
          mail.summary_meta?.interval ?? null,
          mail.summary_meta?.range_start ?? null,
          mail.summary_meta?.range_end ?? null,
          now,
        ],
      );
    }

    for (const summary of summaries) {
      await this.run(
        db,
        `
          INSERT INTO summaries (
            id,
            created_at,
            interval,
            range_start,
            range_end,
            task_finished,
            task_failed,
            task_rest,
            task_rate,
            task_summary,
            mood_total,
            mood_summary,
            mood_event_track_json,
            mood_daily_totals_json,
            mood_monthly_averages_json,
            summary,
            title,
            mail_id,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          summary.id,
          summary.created_at,
          summary.interval,
          summary.range_start,
          summary.range_end,
          summary.tasks.finished,
          summary.tasks.failed,
          summary.tasks.rest,
          summary.tasks.rate,
          summary.tasks.summary,
          summary.mood.total,
          summary.mood.summary,
          stringifyJson(summary.mood.event_track),
          stringifyJson(summary.mood.daily_totals),
          stringifyJson(summary.mood.monthly_averages),
          summary.summary,
          summary.title,
          summary.mail_id,
          now,
        ],
      );
    }
  }

  private async writeAiJobs(db: SQLiteDBConnection, aiJobs: PendingAiJob[]): Promise<void> {
    const now = new Date().toISOString();

    for (const job of aiJobs) {
      await this.run(
        db,
        `
          INSERT INTO ai_jobs (
            id,
            type,
            status,
            run_at,
            retry_count,
            resume_status,
            client_request_id,
            remote_task_id,
            remote_status,
            remote_error_code,
            remote_response,
            remote_created_at,
            remote_started_at,
            remote_finished_at,
            payload_json,
            last_error,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        [
          job.id,
          job.type,
          job.status,
          job.run_at,
          job.retry_count,
          job.resume_status ?? null,
          job.client_request_id ?? null,
          job.remote_task_id ?? null,
          job.remote_status ?? null,
          job.remote_error_code ?? null,
          job.remote_response ?? null,
          job.remote_created_at ?? null,
          job.remote_started_at ?? null,
          job.remote_finished_at ?? null,
          stringifyJson(job.payload),
          job.last_error ?? null,
          now,
        ],
      );
    }
  }

  private isTaskSystemTag(tag: Tag): boolean {
    const label = normalizeLabel(tag.label);
    return label === 'task' || label === 'ongoing' || label === 'finished' || label === 'not_finished';
  }
}

export const databaseService = new DatabaseService();

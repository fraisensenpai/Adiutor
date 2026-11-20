import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { AppSettings, UsageRecord, UsageSummary, ChatMessage } from '../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

/**
 * Yerel veri katmanı.
 *
 * SQLite, `node-sqlite3-wasm` (SQLite'ın WASM derlemesi) ile çalışır: gerçek bir
 * SQLite dosyasıdır, yerel derleme (native build) gerektirmez. Veritabanı
 * kullanıcının uygulama veri klasöründe tutulur.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface SqliteDatabase {
  exec(sql: string): void;
  run(sql: string, params?: unknown[] | Record<string, unknown>): { changes: number; lastInsertRowid: number | bigint };
  get(sql: string, params?: unknown[] | Record<string, unknown>): Row | undefined | null;
  all(sql: string, params?: unknown[] | Record<string, unknown>): Row[];
  close(): void;
}

let db: SqliteDatabase | null = null;
let dbPath = '';

function schema(database: SqliteDatabase) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      task_label TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL,
      completion_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL,
      estimated INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_task ON usage_events(task_id);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      agent_role TEXT,
      meta TEXT
    );
  `);
}

export function initDatabase(): string {
  if (db) return dbPath;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Database } = require('node-sqlite3-wasm') as {
    Database: new (file: string) => SqliteDatabase;
  };
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'adiutor.sqlite');
  db = new Database(dbPath);
  schema(db);
  return dbPath;
}

export function databaseFilePath(): string {
  return dbPath;
}

function handle(): SqliteDatabase {
  if (!db) initDatabase();
  if (!db) throw new Error('Veritabanı açılamadı.');
  return db;
}

/* ----------------------------- ayarlar ----------------------------- */

export function getSettings(): AppSettings {
  const stored = getKv('settings');
  if (!stored) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      agents: { ...DEFAULT_SETTINGS.agents, ...(parsed.agents ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  setKv('settings', JSON.stringify(settings));
  return getSettings();
}

export function getKv(key: string): string | null {
  const row = handle().get('SELECT value FROM kv WHERE key = ?', [key]);
  return row && typeof row.value === 'string' ? row.value : null;
}

export function setKv(key: string, value: string): void {
  handle().run(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  );
}

/* ----------------------------- kullanım ----------------------------- */

const USAGE_COLUMNS = `id, task_id, task_label, agent_role, provider, model,
  prompt_tokens, completion_tokens, total_tokens, estimated, purpose, created_at`;

function rowToUsage(row: Row): UsageRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    taskLabel: String(row.task_label),
    agentRole: row.agent_role as UsageRecord['agentRole'],
    provider: row.provider as UsageRecord['provider'],
    model: String(row.model),
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    totalTokens: Number(row.total_tokens),
    estimated: Number(row.estimated) === 1,
    purpose: String(row.purpose),
    createdAt: Number(row.created_at),
  };
}

export function insertUsage(record: UsageRecord): void {
  handle().run(
    `INSERT OR REPLACE INTO usage_events (${USAGE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.taskId,
      record.taskLabel,
      record.agentRole,
      record.provider,
      record.model,
      record.promptTokens,
      record.completionTokens,
      record.totalTokens,
      record.estimated ? 1 : 0,
      record.purpose,
      record.createdAt,
    ],
  );
}

export function listUsage(limit = 200): UsageRecord[] {
  return handle()
    .all(`SELECT ${USAGE_COLUMNS} FROM usage_events ORDER BY created_at DESC LIMIT ?`, [limit])
    .map(rowToUsage);
}

export function usageSummary(): UsageSummary {
  const database = handle();
  const totals = database.get(
    `SELECT COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS total,
            COALESCE(SUM(CASE WHEN estimated = 0 THEN total_tokens ELSE 0 END), 0) AS measured,
            COALESCE(SUM(CASE WHEN estimated = 1 THEN total_tokens ELSE 0 END), 0) AS estimated
     FROM usage_events`,
  );
  const byProvider = database
    .all(
      `SELECT provider, COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests
       FROM usage_events GROUP BY provider ORDER BY tokens DESC`,
    )
    .map((row) => ({
      provider: row.provider as UsageRecord['provider'],
      tokens: Number(row.tokens),
      requests: Number(row.requests),
    }));
  const byAgent = database
    .all(
      `SELECT agent_role AS agent, COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests
       FROM usage_events GROUP BY agent_role ORDER BY tokens DESC`,
    )
    .map((row) => ({
      agent: String(row.agent),
      tokens: Number(row.tokens),
      requests: Number(row.requests),
    }));
  const byTask = database
    .all(
      `SELECT task_id AS taskId, task_label AS label, COALESCE(SUM(total_tokens), 0) AS tokens, COUNT(*) AS requests
       FROM usage_events GROUP BY task_id ORDER BY tokens DESC LIMIT 25`,
    )
    .map((row) => ({
      taskId: String(row.taskId),
      label: String(row.label),
      tokens: Number(row.tokens),
      requests: Number(row.requests),
    }));

  return {
    requestCount: Number(totals?.requests ?? 0),
    totalTokens: Number(totals?.total ?? 0),
    measuredTokens: Number(totals?.measured ?? 0),
    estimatedTokens: Number(totals?.estimated ?? 0),
    byProvider,
    byAgent,
    byTask,
  };
}

/* ------------------------------ sohbet ------------------------------ */

interface StoredMessageRow extends Row {
  id: string;
  role: string;
  content: string;
  created_at: number;
  agent_role: string | null;
  meta: string | null;
}

export function appendChatMessage(message: ChatMessage): void {
  const { changeIds, approvalIds, ...rest } = message;
  handle().run(
    `INSERT OR REPLACE INTO chat_messages (id, role, content, created_at, agent_role, meta)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.role,
      message.content,
      message.createdAt,
      message.agentRole ?? null,
      JSON.stringify({ ...rest, changeIds, approvalIds }),
    ],
  );
}

export function loadChatMessages(limit = 200): ChatMessage[] {
  const rows = handle().all(
    `SELECT id, role, content, created_at, agent_role, meta FROM chat_messages
     ORDER BY created_at ASC LIMIT ?`,
    [limit],
  ) as StoredMessageRow[];
  return rows.map((row) => {
    let meta: Partial<ChatMessage> = {};
    try {
      meta = row.meta ? (JSON.parse(row.meta) as Partial<ChatMessage>) : {};
    } catch {
      meta = {};
    }
    return {
      ...meta,
      id: row.id,
      role: row.role as ChatMessage['role'],
      content: row.content,
      createdAt: Number(row.created_at),
      agentRole: (row.agent_role as ChatMessage['agentRole']) ?? undefined,
      pending: false,
    };
  });
}

export function clearChatMessages(): void {
  handle().run('DELETE FROM chat_messages');
}

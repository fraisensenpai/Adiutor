import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { AppSettings, UsageRecord, UsageSummary, ChatMessage, ChatSession } from '../../src/shared/types';
import { DEFAULT_SETTINGS, DEFAULT_MODEL, isProviderId, isThemeMode, migrateModel } from '../../src/shared/settings';
import { stripInvokePrefix } from '../../src/shared/errors';

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
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Eski veritabanlarında oturum kolonu yok; sessizce eklenir.
  const columns = database.all('PRAGMA table_info(chat_messages)') as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'session_id')) {
    database.exec('ALTER TABLE chat_messages ADD COLUMN session_id TEXT');
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at)');
  ensureChatSessions(database);
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
    // Eski sürümlerde kaldırılmış sağlayıcı kimlikleri kalmış olabilir.
    const provider = isProviderId(parsed.provider) ? parsed.provider : DEFAULT_SETTINGS.provider;
    const staleModel = !parsed.model || !isProviderId(parsed.provider);
    const agents = { ...DEFAULT_SETTINGS.agents, ...(parsed.agents ?? {}) };
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      provider,
      model: staleModel ? DEFAULT_MODEL : migrateModel(parsed.model),
      theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      agents: staleModel
        ? {
            planner: { ...agents.planner, model: DEFAULT_MODEL },
            coder: { ...agents.coder, model: DEFAULT_MODEL },
            reviewer: { ...agents.reviewer, model: DEFAULT_MODEL },
          }
        : {
            planner: { ...agents.planner, model: migrateModel(agents.planner.model) },
            coder: { ...agents.coder, model: migrateModel(agents.coder.model) },
            reviewer: { ...agents.reviewer, model: migrateModel(agents.reviewer.model) },
          },
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
      `SELECT MIN(task_id) AS taskId, task_label AS label, COALESCE(SUM(total_tokens), 0) AS tokens,
              COUNT(*) AS requests
       FROM usage_events GROUP BY task_label ORDER BY tokens DESC LIMIT 25`,
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

interface StoredSessionRow extends Row {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count?: number;
}

export const DEFAULT_CHAT_SESSION = 'session-default';

function createSessionRow(database: SqliteDatabase, id: string, title: string): void {
  const now = Date.now();
  database.run(
    `INSERT OR IGNORE INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [id, title, now, now],
  );
}

/** Oturum tablosu boşsa varsayılan bir oturum açar ve eski mesajları ona bağlar. */
function ensureChatSessions(database: SqliteDatabase): void {
  const row = database.get('SELECT COUNT(*) AS count FROM chat_sessions') as { count: number } | undefined;
  if (!row || Number(row.count) === 0) {
    createSessionRow(database, DEFAULT_CHAT_SESSION, 'Sohbet');
  }
  database.run(`UPDATE chat_messages SET session_id = ? WHERE session_id IS NULL OR session_id = ''`, [
    DEFAULT_CHAT_SESSION,
  ]);
}

function titleFromMessage(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Yeni sohbet';
  return plain.length > 52 ? `${plain.slice(0, 52).trimEnd()}…` : plain;
}

export function listChatSessions(): ChatSession[] {
  const rows = handle().all(
    `SELECT s.id, s.title, s.created_at, s.updated_at, COUNT(m.id) AS message_count
     FROM chat_sessions s
     LEFT JOIN chat_messages m ON m.session_id = s.id
     GROUP BY s.id
     ORDER BY s.updated_at DESC`,
  ) as StoredSessionRow[];
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messageCount: Number(row.message_count ?? 0),
  }));
}

export function createChatSession(id: string, title = 'Yeni sohbet'): ChatSession {
  const database = handle();
  createSessionRow(database, id, title);
  const row = database.get('SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ?', [
    id,
  ]) as StoredSessionRow;
  return {
    id: row.id,
    title: row.title,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    messageCount: 0,
  };
}

export function deleteChatSession(id: string): void {
  const database = handle();
  database.run('DELETE FROM chat_messages WHERE session_id = ?', [id]);
  database.run('DELETE FROM chat_sessions WHERE id = ?', [id]);
  ensureChatSessions(database);
}

export function appendChatMessage(sessionId: string, message: ChatMessage): void {
  const database = handle();
  const session = database.get('SELECT id FROM chat_sessions WHERE id = ?', [sessionId]) as
    | { id: string }
    | undefined;
  if (!session) createSessionRow(database, sessionId, 'Yeni sohbet');

  const { changeIds, approvalIds, ...rest } = message;
  database.run(
    `INSERT OR REPLACE INTO chat_messages (id, role, content, created_at, agent_role, meta, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.role,
      message.content,
      message.createdAt,
      message.agentRole ?? null,
      JSON.stringify({ ...rest, changeIds, approvalIds }),
      sessionId,
    ],
  );

  const now = Date.now();
  if (message.role === 'user') {
    database.run(
      `UPDATE chat_sessions
       SET updated_at = ?,
           title = CASE WHEN title IN ('Yeni sohbet', 'Sohbet', '') THEN ? ELSE title END
       WHERE id = ?`,
      [now, titleFromMessage(message.content), sessionId],
    );
  } else {
    database.run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
  }
}

export function loadChatMessages(sessionId: string, limit = 400): ChatMessage[] {
  const rows = handle().all(
    `SELECT id, role, content, created_at, agent_role, meta FROM chat_messages
     WHERE session_id = ?
     ORDER BY created_at ASC LIMIT ?`,
    [sessionId, limit],
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
      // Eski sürümlerde kaydedilmiş IPC sarmalayıcısı geçmişte görünmesin.
      content: stripInvokePrefix(row.content),
      createdAt: Number(row.created_at),
      agentRole: (row.agent_role as ChatMessage['agentRole']) ?? undefined,
      pending: false,
    };
  });
}

export function clearChatMessages(sessionId: string): void {
  const database = handle();
  database.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  database.run('UPDATE chat_sessions SET updated_at = ? WHERE id = ?', [Date.now(), sessionId]);
}

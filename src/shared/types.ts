/**
 * Adiutor — ana süreç (Electron) ve arayüz (React) arasında paylaşılan tipler.
 * Bu dosya hiçbir çalışma zamanı bağımlılığı içermez.
 */

export type ViewId = 'editor' | 'graph' | 'map' | 'usage' | 'settings';

/* ------------------------------------------------------------------ */
/* Çalışma alanı                                                       */
/* ------------------------------------------------------------------ */

export interface WorkspaceInfo {
  root: string;
  name: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  /** Taranan öğe sayısı sınıra ulaştığı için içerik atlandı. */
  truncated?: boolean;
}

export interface FileReadResult {
  path: string;
  content: string;
  language: Language;
  /** Dosya çok büyük veya ikili olduğu için okunamadıysa dolu. */
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Proje indeksi                                                       */
/* ------------------------------------------------------------------ */

export type Language = 'typescript' | 'tsx' | 'javascript' | 'jsx' | 'python' | 'other';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'interface'
  | 'type'
  | 'enum'
  | 'import'
  | 'module';

export interface IndexedSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  endLine: number;
  container?: string;
  exported: boolean;
}

export interface IndexedFile {
  path: string;
  language: Language;
  size: number;
  lines: number;
  symbolCount: number;
  importCount: number;
  updatedAt: number;
  parseError?: string;
}

export interface IndexProgress {
  state: 'idle' | 'scanning' | 'ready' | 'error';
  scanned: number;
  total: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface LspStatus {
  available: boolean;
  running: boolean;
  server?: string;
  message: string;
}

export interface IndexSnapshot {
  root: string;
  status: IndexProgress;
  files: IndexedFile[];
  symbols: IndexedSymbol[];
  skippedFiles: number;
  skippedReasons: Record<string, number>;
  parser: 'tree-sitter' | 'heuristic';
  parserNote: string;
  watcherActive: boolean;
  lsp: LspStatus;
}

export interface SymbolReference {
  file: string;
  line: number;
  column: number;
}

export interface SymbolRelations {
  symbolId: string;
  definition: IndexedSymbol | null;
  references: SymbolReference[];
}

export interface ContextRequest {
  symbolIds?: string[];
  paths?: string[];
  /** Editördeki seçili metin (satır numaraları ile). */
  selection?: { path: string; startLine: number; endLine: number; text: string };
  maxTokens?: number;
}

export interface ContextItem {
  id: string;
  kind: 'file' | 'symbol' | 'selection';
  path: string;
  label: string;
  reason: string;
  startLine?: number;
  endLine?: number;
  content: string;
  tokens: number;
  truncated: boolean;
}

export interface ContextBundle {
  items: ContextItem[];
  totalTokens: number;
  budget: number;
  omitted: number;
}

/* ------------------------------------------------------------------ */
/* Sağlayıcılar                                                        */
/* ------------------------------------------------------------------ */

export type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'grok';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  requiresApiKey: boolean;
  models: string[];
  defaultModel: string;
  note: string;
  keyHint: string;
  docsUrl: string;
}

export interface ProviderStatus {
  providers: ProviderInfo[];
  apiKeys: Partial<Record<ProviderId, boolean>>;
  encryptionAvailable: boolean;
  keyStorage: string;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  requestId: string;
  provider: ProviderId;
  model: string;
  messages: ChatTurn[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Kayıt/etiketleme amaçlı: plan | code | review | chat */
  purpose: string;
  agentRole?: AgentRole;
  taskId?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Değer gerçek sağlayıcı yanıtından gelmiyorsa true. */
  estimated: boolean;
}

export interface CompletionResult {
  requestId: string;
  text: string;
  usage: TokenUsage;
  model: string;
  provider: ProviderId;
  latencyMs: number;
}

export interface ProviderError {
  message: string;
  code?: string;
  status?: number;
}

/* ------------------------------------------------------------------ */
/* Ajanlar ve görev grafiği                                            */
/* ------------------------------------------------------------------ */

export type AgentRole = 'planner' | 'coder' | 'reviewer';

export type AgentStatus =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'done'
  | 'stopped'
  | 'error';

export interface AgentStepResult {
  id: string;
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  at: number;
}

export interface AgentNodeState {
  /** Grafikteki sabit düğüm kimliği. */
  id: 'planner' | 'coder' | 'reviewer';
  name: string;
  role: AgentRole;
  model: string;
  status: AgentStatus;
  tokens: number;
  estimatedTokens: number;
  lastMessage?: string;
  steps: AgentStepResult[];
}

export interface AgentEdgeState {
  id: string;
  from: AgentNodeState['id'];
  to: AgentNodeState['id'];
  label: string;
  state: 'idle' | 'active' | 'done' | 'blocked';
}

export type ApprovalType = 'new-task' | 'command';

export interface PendingApproval {
  id: string;
  taskId: string;
  type: ApprovalType;
  from: AgentNodeState['id'];
  title: string;
  description: string;
  command?: string;
  targetRole?: AgentRole;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export type TaskStatus =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'done'
  | 'stopped'
  | 'error';

export interface TaskLogEntry {
  id: string;
  at: number;
  agent?: AgentRole;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

/* ------------------------------------------------------------------ */
/* Değişiklikler                                                       */
/* ------------------------------------------------------------------ */

export interface ProposedChange {
  id: string;
  taskId: string;
  filePath: string;
  agentRole: AgentRole;
  summary: string;
  original: string;
  proposed: string;
  isNewFile: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  error?: string;
  /** Kabul edilmiş değişiklik geri alındıysa dolu. */
  undoneAt?: number;
}

/* ------------------------------------------------------------------ */
/* Sohbet                                                              */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  agentRole?: AgentRole;
  pending?: boolean;
  error?: boolean;
  changeIds?: string[];
  approvalIds?: string[];
  contextTokens?: number;
  model?: string;
}

/* ------------------------------------------------------------------ */
/* Kullanım                                                            */
/* ------------------------------------------------------------------ */

export interface UsageRecord {
  id: string;
  taskId: string;
  taskLabel: string;
  agentRole: AgentRole | 'chat';
  provider: ProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated: boolean;
  purpose: string;
  createdAt: number;
}

export interface UsageSummary {
  requestCount: number;
  totalTokens: number
  measuredTokens: number;
  estimatedTokens: number;
  byProvider: Array<{ provider: ProviderId; tokens: number; requests: number }>;
  byAgent: Array<{ agent: string; tokens: number; requests: number }>;
  byTask: Array<{ taskId: string; label: string; tokens: number; requests: number }>;
}

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

export interface AgentConfig {
  model: string;
  enabled: boolean;
}

export interface AppSettings {
  provider: ProviderId;
  model: string;
  agents: Record<AgentRole, AgentConfig>;
  maxContextTokens: number;
}

/* ------------------------------------------------------------------ */
/* Terminal                                                            */
/* ------------------------------------------------------------------ */

export interface TerminalStartResult {
  sessionId: string;
  shell: string;
  cwd: string;
}

export interface CommandResult {
  code: number | null;
  output: string;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Yardımcı                                                            */
/* ------------------------------------------------------------------ */

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  parser: string;
}

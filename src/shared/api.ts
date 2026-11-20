import type {
  AppInfo,
  AppSettings,
  ChatMessage,
  CommandResult,
  CompletionRequest,
  CompletionResult,
  ContextBundle,
  ContextRequest,
  FileReadResult,
  FileTreeNode,
  IndexProgress,
  IndexSnapshot,
  ProviderStatus,
  SymbolRelations,
  TerminalStartResult,
  UsageRecord,
  UsageSummary,
  WorkspaceInfo,
} from './types';
import type { MenuAction } from './ipc';

export interface LspDiagnosticItem {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
}

export interface LspDiagnosticsResult {
  available: boolean;
  running: boolean;
  message: string;
  items: LspDiagnosticItem[];
}

/** Preload köprüsünün arayüze açtığı API. */
export interface AdiutorApi {
  app: {
    info(): Promise<AppInfo>;
  };
  workspace: {
    openDialog(): Promise<WorkspaceInfo | null>;
    openPath(target: string): Promise<WorkspaceInfo>;
    createSample(): Promise<WorkspaceInfo>;
    readTree(root: string): Promise<FileTreeNode>;
    readFile(target: string): Promise<FileReadResult>;
    saveFile(target: string, content: string): Promise<{ path: string; bytes: number }>;
    reveal(target: string): Promise<void>;
  };
  index: {
    snapshot(root: string): Promise<IndexSnapshot>;
    reindex(root: string): Promise<IndexSnapshot>;
    relations(root: string, symbolId: string): Promise<SymbolRelations>;
    context(root: string, request: ContextRequest): Promise<ContextBundle>;
    notifySaved(target: string): Promise<void>;
  };
  lsp: {
    diagnostics(target: string): Promise<LspDiagnosticsResult>;
  };
  providers: {
    status(): Promise<ProviderStatus>;
    complete(request: CompletionRequest): Promise<CompletionResult>;
    cancel(requestId: string): Promise<void>;
    setApiKey(apiKey: string): Promise<{ ok: boolean; error?: string }>;
    clearApiKey(): Promise<void>;
  };
  usage: {
    list(): Promise<UsageRecord[]>;
    summary(): Promise<UsageSummary>;
    insert(record: UsageRecord): Promise<void>;
  };
  settings: {
    get(): Promise<AppSettings>;
    set(settings: AppSettings): Promise<AppSettings>;
  };
  chat: {
    load(): Promise<ChatMessage[]>;
    append(message: ChatMessage): Promise<void>;
    clear(): Promise<void>;
  };
  terminal: {
    start(cwd: string): Promise<TerminalStartResult>;
    write(sessionId: string, data: string): Promise<void>;
    kill(sessionId: string): Promise<void>;
    run(cwd: string, command: string): Promise<CommandResult>;
  };
  events: {
    onIndexProgress(listener: (payload: { root: string; progress: IndexProgress }) => void): () => void;
    onTerminalData(listener: (payload: { sessionId: string; data: string }) => void): () => void;
    onTerminalExit(listener: (payload: { sessionId: string; code: number | null }) => void): () => void;
    onMenuAction(listener: (action: MenuAction) => void): () => void;
    onFileChanged(listener: (payload: { path: string; type: 'change' | 'add' | 'unlink' }) => void): () => void;
  };
}

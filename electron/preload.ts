import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type MenuAction } from '../src/shared/ipc';
import type { AdiutorApi } from '../src/shared/api';
import type {
  AppSettings,
  ChatMessage,
  CompletionRequest,
  ContextRequest,
  IndexProgress,
  ProviderId,
  UsageRecord,
} from '../src/shared/types';

function subscribe<TPayload>(channel: string, listener: (payload: TPayload) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: TPayload) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * `ipcRenderer.invoke` sarmalayıcısı.
 *
 * Electron, ana süreçte fırlatılan hatayı "Error invoking remote method 'kanal':
 * Error: …" biçiminde sarar. Kullanıcıya yalnızca gerçek mesaj gösterilir.
 */
const INVOKE_PREFIX = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message = raw.replace(INVOKE_PREFIX, '').trim();
    throw new Error(message || 'İşlem tamamlanamadı.');
  }
}

const api: AdiutorApi = {
  app: {
    info: () => call(IPC.appInfo),
  },
  workspace: {
    openDialog: () => call(IPC.openFolderDialog),
    openPath: (target: string) => call(IPC.openFolderPath, target),
    createSample: () => call(IPC.createSampleWorkspace),
    readTree: (root: string) => call(IPC.readTree, root),
    readFile: (target: string) => call(IPC.readFile, target),
    saveFile: (target: string, content: string) => call(IPC.saveFile, target, content),
    reveal: (target: string) => call(IPC.revealPath, target),
  },
  index: {
    snapshot: (root: string) => call(IPC.indexSnapshot, root),
    reindex: (root: string) => call(IPC.indexReindex, root),
    relations: (root: string, symbolId: string) =>
      call(IPC.indexRelations, root, symbolId),
    context: (root: string, request: ContextRequest) =>
      call(IPC.indexContext, root, request),
    notifySaved: (target: string) => call(IPC.indexApply, target),
  },
  lsp: {
    diagnostics: (target: string) => call(IPC.lspDiagnostics, target),
  },
  providers: {
    status: () => call(IPC.providerStatus),
    complete: (request: CompletionRequest) => call(IPC.providerComplete, request),
    cancel: (requestId: string) => call(IPC.providerCancel, requestId),
    setApiKey: (provider: ProviderId, apiKey: string) =>
      call(IPC.secretSet, provider, apiKey),
    clearApiKey: (provider: ProviderId) => call(IPC.secretClear, provider),
  },
  usage: {
    list: () => call(IPC.usageList),
    summary: () => call(IPC.usageSummary),
    insert: (record: UsageRecord) => call(IPC.usageInsert, record),
  },
  settings: {
    get: () => call(IPC.settingsGet),
    set: (settings: AppSettings) => call(IPC.settingsSet, settings),
  },
  chat: {
    load: () => call(IPC.chatLoad),
    append: (message: ChatMessage) => call(IPC.chatAppend, message),
    clear: () => call(IPC.chatClear),
  },
  terminal: {
    start: (cwd: string) => call(IPC.terminalStart, cwd),
    write: (sessionId: string, data: string) => call(IPC.terminalWrite, sessionId, data),
    kill: (sessionId: string) => call(IPC.terminalKill, sessionId),
    run: (cwd: string, command: string) => call(IPC.terminalRun, cwd, command),
  },
  events: {
    onIndexProgress: (listener: (payload: { root: string; progress: IndexProgress }) => void) =>
      subscribe(IPC.eventIndexProgress, listener),
    onTerminalData: (listener: (payload: { sessionId: string; data: string }) => void) =>
      subscribe(IPC.eventTerminalData, listener),
    onTerminalExit: (listener: (payload: { sessionId: string; code: number | null }) => void) =>
      subscribe(IPC.eventTerminalExit, listener),
    onMenuAction: (listener: (action: MenuAction) => void) => subscribe(IPC.menuAction, listener),
    onFileChanged: (listener: (payload: { path: string; type: 'change' | 'add' | 'unlink' }) => void) =>
      subscribe(IPC.eventFileChanged, listener),
  },
};

contextBridge.exposeInMainWorld('adiutor', api);

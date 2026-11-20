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

const api: AdiutorApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
  },
  workspace: {
    openDialog: () => ipcRenderer.invoke(IPC.openFolderDialog),
    openPath: (target: string) => ipcRenderer.invoke(IPC.openFolderPath, target),
    createSample: () => ipcRenderer.invoke(IPC.createSampleWorkspace),
    readTree: (root: string) => ipcRenderer.invoke(IPC.readTree, root),
    readFile: (target: string) => ipcRenderer.invoke(IPC.readFile, target),
    saveFile: (target: string, content: string) => ipcRenderer.invoke(IPC.saveFile, target, content),
    reveal: (target: string) => ipcRenderer.invoke(IPC.revealPath, target),
  },
  index: {
    snapshot: (root: string) => ipcRenderer.invoke(IPC.indexSnapshot, root),
    reindex: (root: string) => ipcRenderer.invoke(IPC.indexReindex, root),
    relations: (root: string, symbolId: string) =>
      ipcRenderer.invoke(IPC.indexRelations, root, symbolId),
    context: (root: string, request: ContextRequest) =>
      ipcRenderer.invoke(IPC.indexContext, root, request),
    notifySaved: (target: string) => ipcRenderer.invoke(IPC.indexApply, target),
  },
  lsp: {
    diagnostics: (target: string) => ipcRenderer.invoke(IPC.lspDiagnostics, target),
  },
  providers: {
    status: () => ipcRenderer.invoke(IPC.providerStatus),
    complete: (request: CompletionRequest) => ipcRenderer.invoke(IPC.providerComplete, request),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.providerCancel, requestId),
    setApiKey: (provider: ProviderId, apiKey: string) =>
      ipcRenderer.invoke(IPC.secretSet, provider, apiKey),
    clearApiKey: (provider: ProviderId) => ipcRenderer.invoke(IPC.secretClear, provider),
  },
  usage: {
    list: () => ipcRenderer.invoke(IPC.usageList),
    summary: () => ipcRenderer.invoke(IPC.usageSummary),
    insert: (record: UsageRecord) => ipcRenderer.invoke(IPC.usageInsert, record),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (settings: AppSettings) => ipcRenderer.invoke(IPC.settingsSet, settings),
  },
  chat: {
    load: () => ipcRenderer.invoke(IPC.chatLoad),
    append: (message: ChatMessage) => ipcRenderer.invoke(IPC.chatAppend, message),
    clear: () => ipcRenderer.invoke(IPC.chatClear),
  },
  terminal: {
    start: (cwd: string) => ipcRenderer.invoke(IPC.terminalStart, cwd),
    write: (sessionId: string, data: string) => ipcRenderer.invoke(IPC.terminalWrite, sessionId, data),
    kill: (sessionId: string) => ipcRenderer.invoke(IPC.terminalKill, sessionId),
    run: (cwd: string, command: string) => ipcRenderer.invoke(IPC.terminalRun, cwd, command),
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

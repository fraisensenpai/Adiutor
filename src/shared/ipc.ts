/** Ana süreç ↔ arayüz arasındaki kanal adları (tek kaynak). */

export const IPC = {
  appInfo: 'app:info',
  openFolderDialog: 'workspace:open-dialog',
  openFolderPath: 'workspace:open-path',
  createSampleWorkspace: 'workspace:create-sample',
  readTree: 'workspace:read-tree',
  readFile: 'workspace:read-file',
  saveFile: 'workspace:save-file',
  revealPath: 'workspace:reveal',

  indexSnapshot: 'index:snapshot',
  indexReindex: 'index:reindex',
  indexRelations: 'index:relations',
  indexContext: 'index:context',
  indexApply: 'index:apply-edit',

  lspDiagnostics: 'lsp:diagnostics',

  providerStatus: 'provider:status',
  providerComplete: 'provider:complete',
  providerCancel: 'provider:cancel',
  secretSet: 'secret:set',
  secretClear: 'secret:clear',

  usageList: 'usage:list',
  usageSummary: 'usage:summary',
  usageInsert: 'usage:insert',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  chatLoad: 'chat:load',
  chatAppend: 'chat:append',
  chatClear: 'chat:clear',

  terminalStart: 'terminal:start',
  terminalWrite: 'terminal:write',
  terminalKill: 'terminal:kill',
  terminalRun: 'terminal:run',

  eventIndexProgress: 'event:index-progress',
  eventTerminalData: 'event:terminal-data',
  eventTerminalExit: 'event:terminal-exit',
  eventLspStatus: 'event:lsp-status',
  menuAction: 'event:menu-action',
  eventFileChanged: 'event:file-changed',
} as const;

export type MenuAction =
  | 'open-folder'
  | 'open-editor'
  | 'open-sample'
  | 'save'
  | 'toggle-terminal'
  | 'open-settings'
  | 'open-graph'
  | 'open-map'
  | 'open-usage';

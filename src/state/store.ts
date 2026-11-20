import { create } from 'zustand';
import { bridge } from '@/lib/bridge';
import { buildWorkspaceDigest, type AgentFile } from '@/core/prompts';
import { runTask, type TaskRuntime } from '@/core/taskRunner';
import { taskControl } from '@/core/taskControl';
import { awaitApproval, settleAllApprovals, settleApproval } from '@/core/approvals';
import { DEMO_MODEL } from '@shared/settings';
import type { LspDiagnosticItem } from '@shared/api';
import type {
  AgentEdgeState,
  AgentNodeState,
  AgentRole,
  AgentStatus,
  AppInfo,
  AppSettings,
  ChatMessage,
  ContextItem,
  FileTreeNode,
  IndexProgress,
  IndexSnapshot,
  Language,
  PendingApproval,
  ProposedChange,
  ProviderStatus,
  TaskLogEntry,
  TaskStatus,
  UsageRecord,
  UsageSummary,
  ViewId,
  WorkspaceInfo,
} from '@shared/types';
import { basename, isSecretPath, relativeTo, resolveInWorkspace } from '@/lib/format';

export interface EditorTab {
  path: string;
  name: string;
  language: Language;
  content: string;
  savedContent: string;
  dirty: boolean;
}

export type SidebarTab = 'files' | 'map';
export type BottomTab = 'terminal' | 'log' | 'problems';

export interface TaskState {
  id: string | null;
  title: string;
  status: TaskStatus;
}

export interface ToastState {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'warn' | 'error';
}

interface AppState {
  appInfo: AppInfo | null;
  initialized: boolean;
  view: ViewId;
  workspace: WorkspaceInfo | null;
  tree: FileTreeNode | null;
  treeLoading: boolean;
  tabs: EditorTab[];
  activePath: string | null;
  pendingReveal: { path: string; line: number } | null;
  sidebarTab: SidebarTab;
  index: IndexSnapshot | null;
  indexProgress: IndexProgress;
  indexBusy: boolean;
  contextItems: ContextItem[];
  contextPreviewOpen: boolean;
  chat: ChatMessage[];
  chatInput: string;
  chatBusy: boolean;
  settings: AppSettings;
  providerStatus: ProviderStatus | null;
  agents: Record<AgentRole, AgentNodeState>;
  edges: AgentEdgeState[];
  approvals: PendingApproval[];
  changes: ProposedChange[];
  task: TaskState;
  log: TaskLogEntry[];
  usage: UsageRecord[];
  usageSummaryData: UsageSummary | null;
  reviewOpen: boolean;
  bottomOpen: boolean;
  bottomTab: BottomTab;
  problems: LspDiagnosticItem[];
  problemsMessage: string;
  problemsLoading: boolean;
  selection: { path: string; startLine: number; endLine: number; text: string } | null;
  toast: ToastState | null;
}

interface AppActions {
  init(): Promise<void>;
  setView(view: ViewId): void;
  setSidebarTab(tab: SidebarTab): void;
  setBottomTab(tab: BottomTab): void;
  toggleBottom(): void;
  openFolderDialog(): Promise<void>;
  openSample(): Promise<void>;
  openWorkspace(info: WorkspaceInfo): Promise<void>;
  refreshTree(): Promise<void>;
  refreshSnapshot(): Promise<void>;
  refreshIndex(): Promise<void>;
  openFile(path: string, line?: number): Promise<void>;
  closeTab(path: string): void;
  setActiveTab(path: string): void;
  updateTabContent(path: string, content: string): void;
  saveActive(): Promise<void>;
  clearPendingReveal(): void;
  setSelection(selection: AppState['selection']): void;
  addFilesToContext(paths: string[]): Promise<void>;
  addSymbolToContext(symbolId: string): Promise<void>;
  addSelectionToContext(): Promise<void>;
  removeContext(id: string): void;
  clearContext(): void;
  setContextPreviewOpen(open: boolean): void;
  setChatInput(value: string): void;
  sendChat(): Promise<void>;
  clearChat(): Promise<void>;
  startTask(title: string): Promise<void>;
  stopTask(): void;
  approve(id: string): void;
  reject(id: string): void;
  acceptChange(id: string): Promise<void>;
  rejectChange(id: string): void;
  undoChange(id: string): Promise<void>;
  acceptAllChanges(): Promise<void>;
  rejectAllChanges(): void;
  openReview(): void;
  closeReview(): void;
  refreshUsage(): Promise<void>;
  refreshProblems(): Promise<void>;
  setAgentModel(role: AgentRole, model: string): void;
  setAgentName(role: AgentRole, name: string): void;
  setAgentRole(role: AgentRole, next: AgentRole): void;
  setProvider(provider: 'demo' | 'openai'): Promise<void>;
  saveSettings(patch: Partial<AppSettings>): Promise<void>;
  setApiKey(apiKey: string): Promise<boolean>;
  clearApiKey(): Promise<void>;
  notify(message: string, tone?: ToastState['tone']): void;
  dismissToast(): void;
}

export type AppStore = AppState & AppActions;

function initialAgents(models?: Partial<Record<AgentRole, string>>): Record<AgentRole, AgentNodeState> {
  const model = (role: AgentRole) => models?.[role] ?? DEMO_MODEL;
  return {
    planner: {
      id: 'planner',
      name: 'Planlayıcı',
      role: 'planner',
      model: model('planner'),
      status: 'idle',
      tokens: 0,
      estimatedTokens: 0,
      steps: [],
    },
    coder: {
      id: 'coder',
      name: 'Kodlayıcı',
      role: 'coder',
      model: model('coder'),
      status: 'idle',
      tokens: 0,
      estimatedTokens: 0,
      steps: [],
    },
    reviewer: {
      id: 'reviewer',
      name: 'İnceleyici',
      role: 'reviewer',
      model: model('reviewer'),
      status: 'idle',
      tokens: 0,
      estimatedTokens: 0,
      steps: [],
    },
  };
}

const initialEdges: AgentEdgeState[] = [
  { id: 'planner-coder', from: 'planner', to: 'coder', label: 'görev devri', state: 'idle' },
  { id: 'coder-reviewer', from: 'coder', to: 'reviewer', label: 'diff incelemesi', state: 'idle' },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function walkTree(node: FileTreeNode | null, visit: (node: FileTreeNode) => void): void {
  if (!node) return;
  visit(node);
  for (const child of node.children ?? []) walkTree(child, visit);
}

function detectTestCommand(tree: FileTreeNode | null): string | null {
  if (!tree) return null;
  let hasPackageJson = false;
  let hasTests = false;
  walkTree(tree, (node) => {
    if (node.type !== 'file') return;
    if (node.name === 'package.json') hasPackageJson = true;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(node.name)) hasTests = true;
    if (node.name === 'pytest.ini' || node.name === 'pyproject.toml') hasTests = true;
  });
  return hasPackageJson && hasTests ? 'npm test' : null;
}

async function collectTargetFiles(state: AppState): Promise<AgentFile[]> {
  const paths: string[] = [];
  for (const item of state.contextItems) {
    if (!paths.includes(item.path) && !isSecretPath(item.path)) paths.push(item.path);
  }
  if (state.index && paths.length < 2) {
    const ranked = [...state.index.files].sort((a, b) => b.symbolCount - a.symbolCount);
    for (const file of ranked) {
      if (paths.length >= 2) break;
      if (!paths.includes(file.path) && !isSecretPath(file.path)) paths.push(file.path);
    }
  }

  const files: AgentFile[] = [];
  for (const filePath of paths.slice(0, 3)) {
    const fromContext = state.contextItems.find((item) => item.path === filePath);
    let content = fromContext?.content;
    if (content === undefined) {
      const result = await bridge.workspace.readFile(filePath);
      content = result.error ? '' : result.content;
    }
    if (!content) continue;
    files.push({
      path: filePath,
      content: content.length > 8000 ? `${content.slice(0, 8000)}\n…(kırpıldı)` : content,
      reason: fromContext?.reason,
    });
  }
  return files;
}

const WELCOME = (provider: 'demo' | 'openai'): ChatMessage => ({
  id: 'welcome',
  role: 'system',
  createdAt: Date.now(),
  content:
    provider === 'demo'
      ? [
          '**Demo modu etkin.** Hiçbir model çağrılmıyor; yanıtlar kurallı olarak üretiliyor ve her yanıt "demo" olarak işaretleniyor.',
          '',
          'Başlamak için soldaki dosya ağacından bir dosya açın veya **Örnek projeyi aç** ile gerçek bir demo projesi oluşturun. Sonra buraya bir görev yazıp **Görevi başlat** düğmesini kullanın.',
          '',
          'Gerçek model için: **Ayarlar → Sağlayıcı → OpenAI** (anahtar işletim sistemi kasasında saklanır).',
        ].join('\n')
      : '**OpenAI sağlayıcısı seçili.** API anahtarı yalnızca ana süreçte, işletim sistemi kasasından okunur. Bir görev yazıp **Görevi başlat** ile planlayıcı, kodlayıcı ve inceleyici ajanları çalıştırabilirsiniz.',
});

function pushChat(set: (partial: Partial<AppState>) => void, get: () => AppStore, message: ChatMessage): void {
  set({ chat: [...get().chat, message] });
  void bridge.chat.append(message).catch(() => undefined);
}

export const useStore = create<AppStore>()((set, get) => ({
  appInfo: null,
  initialized: false,
  view: 'editor',
  workspace: null,
  tree: null,
  treeLoading: false,
  tabs: [],
  activePath: null,
  pendingReveal: null,
  sidebarTab: 'files',
  index: null,
  indexProgress: { state: 'idle', scanned: 0, total: 0 },
  indexBusy: false,
  contextItems: [],
  contextPreviewOpen: false,
  chat: [],
  chatInput: '',
  chatBusy: false,
  settings: {
    provider: 'demo',
    model: DEMO_MODEL,
    agents: {
      planner: { model: DEMO_MODEL, enabled: true },
      coder: { model: DEMO_MODEL, enabled: true },
      reviewer: { model: DEMO_MODEL, enabled: true },
    },
    maxContextTokens: 6000,
  },
  providerStatus: null,
  agents: initialAgents(),
  edges: initialEdges,
  approvals: [],
  changes: [],
  task: { id: null, title: '', status: 'idle' },
  log: [],
  usage: [],
  usageSummaryData: null,
  reviewOpen: false,
  bottomOpen: true,
  bottomTab: 'terminal',
  problems: [],
  problemsMessage: 'Henüz tanılama istenmedi.',
  problemsLoading: false,
  selection: null,
  toast: null,

  async init() {
    if (get().initialized) return;
    set({ initialized: true });
    try {
      const [settings, providerStatus, chat, usage, summary, info] = await Promise.all([
        bridge.settings.get(),
        bridge.providers.status(),
        bridge.chat.load(),
        bridge.usage.list(),
        bridge.usage.summary(),
        bridge.app.info(),
      ]);
      set({
        settings,
        providerStatus,
        usage,
        usageSummaryData: summary,
        appInfo: info,
        agents: initialAgents({
          planner: settings.agents.planner.model,
          coder: settings.agents.coder.model,
          reviewer: settings.agents.reviewer.model,
        }),
        chat: chat.length > 0 ? chat : [WELCOME(settings.provider)],
      });
      subscribeEvents(set, get);
    } catch (error) {
      get().notify(
        `Başlatma hatası: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`,
        'error',
      );
    }
  },

  setView(view) {
    set({ view });
    if (view === 'usage') void get().refreshUsage();
  },
  setSidebarTab(sidebarTab) {
    set({ sidebarTab });
  },
  setBottomTab(bottomTab) {
    set({ bottomTab, bottomOpen: true });
    if (bottomTab === 'problems') void get().refreshProblems();
  },
  toggleBottom() {
    set({ bottomOpen: !get().bottomOpen });
    if (!get().bottomOpen) return;
    if (get().bottomTab === 'problems') void get().refreshProblems();
  },

  async openFolderDialog() {
    try {
      const info = await bridge.workspace.openDialog();
      if (info) await get().openWorkspace(info);
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Klasör açılamadı.', 'error');
    }
  },

  async openSample() {
    try {
      const info = await bridge.workspace.createSample();
      await get().openWorkspace(info);
      get().notify('Örnek proje hazır. Görev yazıp ajanları deneyebilirsiniz.', 'success');
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Örnek proje oluşturulamadı.', 'error');
    }
  },

  async openWorkspace(info) {
    set({
      workspace: info,
      view: 'editor',
      tree: null,
      treeLoading: true,
      tabs: [],
      activePath: null,
      pendingReveal: null,
      index: null,
      indexBusy: true,
      indexProgress: { state: 'scanning', scanned: 0, total: 0 },
      contextItems: [],
      changes: [],
      approvals: [],
      log: [],
      task: { id: null, title: '', status: 'idle' },
      agents: initialAgents({
        planner: get().settings.agents.planner.model,
        coder: get().settings.agents.coder.model,
        reviewer: get().settings.agents.reviewer.model,
      }),
      edges: initialEdges,
    });
    try {
      const tree = await bridge.workspace.readTree(info.root);
      set({ tree, treeLoading: false });
    } catch (error) {
      set({ treeLoading: false });
      get().notify(error instanceof Error ? error.message : 'Dosya ağacı okunamadı.', 'error');
    }
    try {
      const snapshot = await bridge.index.snapshot(info.root);
      set({ index: snapshot, indexProgress: snapshot.status, indexBusy: snapshot.status.state === 'scanning' });
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'İndeks başlatılamadı.', 'error');
    }
  },

  async refreshTree() {
    const workspace = get().workspace;
    if (!workspace) return;
    try {
      const tree = await bridge.workspace.readTree(workspace.root);
      set({ tree });
    } catch {
      /* sessiz: ağaç yenileme hatası kritik değil */
    }
  },

  async refreshSnapshot() {
    const workspace = get().workspace;
    if (!workspace) return;
    try {
      const snapshot = await bridge.index.snapshot(workspace.root);
      set({
        index: snapshot,
        indexProgress: snapshot.status,
        indexBusy: snapshot.status.state === 'scanning',
      });
    } catch {
      /* yoksay */
    }
  },

  async refreshIndex() {
    const workspace = get().workspace;
    if (!workspace) return;
    set({ indexBusy: true });
    try {
      const snapshot = await bridge.index.reindex(workspace.root);
      set({ index: snapshot, indexProgress: snapshot.status });
      get().notify('İndeks yeniden taranıyor…', 'info');
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'İndeks taranamadı.', 'error');
      set({ indexBusy: false });
    }
  },

  async openFile(path, line) {
    const existing = get().tabs.find((tab) => tab.path === path);
    if (existing) {
      set({ activePath: path, view: 'editor', pendingReveal: line ? { path, line } : null });
      return;
    }
    const result = await bridge.workspace.readFile(path);
    if (result.error) {
      get().notify(result.error, 'warn');
      return;
    }
    const tab: EditorTab = {
      path,
      name: basename(path),
      language: result.language,
      content: result.content,
      savedContent: result.content,
      dirty: false,
    };
    set({
      tabs: [...get().tabs, tab],
      activePath: path,
      view: 'editor',
      pendingReveal: line ? { path, line } : null,
    });
  },

  closeTab(path) {
    const state = get();
    const tab = state.tabs.find((item) => item.path === path);
    if (tab?.dirty && !window.confirm(`${tab.name} kaydedilmedi. Yine de kapatılsın mı?`)) return;
    const tabs = state.tabs.filter((item) => item.path !== path);
    const activePath =
      state.activePath === path ? (tabs.length > 0 ? tabs[tabs.length - 1].path : null) : state.activePath;
    set({ tabs, activePath });
  },

  setActiveTab(path) {
    set({ activePath: path });
  },

  updateTabContent(path, content) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.path === path ? { ...tab, content, dirty: content !== tab.savedContent } : tab,
      ),
    });
  },

  async saveActive() {
    const { activePath, tabs } = get();
    if (!activePath) return;
    const tab = tabs.find((item) => item.path === activePath);
    if (!tab) return;
    try {
      await bridge.workspace.saveFile(tab.path, tab.content);
      await bridge.index.notifySaved(tab.path);
      set({
        tabs: get().tabs.map((item) =>
          item.path === tab.path ? { ...item, savedContent: item.content, dirty: false } : item,
        ),
      });
      get().notify(`${tab.name} kaydedildi.`, 'success');
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Dosya kaydedilemedi.', 'error');
    }
  },

  clearPendingReveal() {
    set({ pendingReveal: null });
  },

  setSelection(selection) {
    set({ selection });
  },

  async addFilesToContext(paths) {
    const { workspace, settings, index } = get();
    if (!workspace || paths.length === 0) return;
    const clean = paths.filter((path) => !isSecretPath(path));
    if (clean.length === 0) {
      get().notify('Gizli dosyalar bağlama eklenmez.', 'warn');
      return;
    }
    try {
      const bundle = await bridge.index.context(workspace.root, {
        paths: clean,
        maxTokens: settings.maxContextTokens,
      });
      const merged = new Map(get().contextItems.map((item) => [item.id, item]));
      for (const item of bundle.items) merged.set(item.id, item);
      set({ contextItems: [...merged.values()] });
      if (bundle.omitted > 0) {
        get().notify(`${bundle.omitted} parça bağlam bütçesine sığmadı ve eklenmedi.`, 'warn');
      } else if (index) {
        get().notify('Bağlama eklendi. Sohbet panelinden içeriği görebilirsiniz.', 'success');
      }
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Bağlam oluşturulamadı.', 'error');
    }
  },

  async addSymbolToContext(symbolId) {
    const { workspace, settings } = get();
    if (!workspace) return;
    try {
      const bundle = await bridge.index.context(workspace.root, {
        symbolIds: [symbolId],
        maxTokens: settings.maxContextTokens,
      });
      const merged = new Map(get().contextItems.map((item) => [item.id, item]));
      for (const item of bundle.items) merged.set(item.id, item);
      set({ contextItems: [...merged.values()] });
      get().notify(
        bundle.omitted > 0 ? 'Sembol bağlam bütçesine sığmadı.' : 'Sembol bağlama eklendi.',
        bundle.omitted > 0 ? 'warn' : 'success',
      );
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Sembol bağlama eklenemedi.', 'error');
    }
  },

  async addSelectionToContext() {
    const { workspace, selection, settings } = get();
    if (!workspace || !selection) {
      get().notify('Önce editörde bir kod seçin.', 'warn');
      return;
    }
    try {
      const bundle = await bridge.index.context(workspace.root, {
        selection,
        maxTokens: settings.maxContextTokens,
      });
      const merged = new Map(get().contextItems.map((item) => [item.id, item]));
      for (const item of bundle.items) merged.set(item.id, item);
      set({ contextItems: [...merged.values()] });
      get().notify('Seçim bağlama eklendi.', 'success');
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Seçim eklenemedi.', 'error');
    }
  },

  removeContext(id) {
    set({ contextItems: get().contextItems.filter((item) => item.id !== id) });
  },

  clearContext() {
    set({ contextItems: [] });
  },

  setContextPreviewOpen(open) {
    set({ contextPreviewOpen: open });
  },

  setChatInput(value) {
    set({ chatInput: value });
  },

  async clearChat() {
    try {
      await bridge.chat.clear();
      set({ chat: [WELCOME(get().settings.provider)] });
      get().notify('Sohbet geçmişi temizlendi.', 'success');
    } catch (error) {
      get().notify(
        error instanceof Error ? error.message : 'Sohbet geçmişi temizlenemedi.',
        'error',
      );
    }
  },

  async sendChat() {
    const state = get();
    const text = state.chatInput.trim();
    if (!text || state.chatBusy) return;
    if (!state.workspace) {
      get().notify('Sohbet için önce bir proje klasörü açın.', 'warn');
      return;
    }
    const provider = state.settings.provider;
    const model = provider === 'demo' ? 'demo-planner' : state.settings.model;
    const userMessage: ChatMessage = {
      id: makeId('msg'),
      role: 'user',
      content: text,
      createdAt: Date.now(),
      contextTokens: state.contextItems.reduce((sum, item) => sum + item.tokens, 0),
    };
    pushChat(set, get, userMessage);
    set({ chatInput: '', chatBusy: true });

    const payload = {
      purpose: 'chat' as const,
      task: text,
      workspaceName: state.workspace.name,
      digest: buildWorkspaceDigest(state.index, state.workspace.name, state.contextItems),
      files: state.contextItems
        .filter((item) => item.kind !== 'symbol')
        .slice(0, 4)
        .map((item) => ({ path: item.path, content: item.content.slice(0, 4000), reason: item.reason })),
      contextLabels: state.contextItems.map((item) => item.label),
    };

    try {
      const result = await bridge.providers.complete({
        requestId: makeId('req'),
        provider,
        model,
        messages:
          provider === 'demo'
            ? [{ role: 'user', content: JSON.stringify(payload) }]
            : [
                {
                  role: 'system',
                  content:
                    'Sen Adiutor masaüstü kod editörünün asistanısın. Verilen bağlamı kullan, dosya değiştirme, yalnızca açıkla. Yanıtı kısa ve Markdown olarak ver.',
                },
                {
                  role: 'user',
                  content: `${text}\n\nBAĞLAM:\n${payload.digest}\n\n${payload.files
                    .map((file) => `--- ${file.path} ---\n${file.content}`)
                    .join('\n\n')}`,
                },
              ],
        maxTokens: 1200,
        purpose: 'chat',
        taskId: state.task.id ?? 'chat',
      });

      const record: UsageRecord = {
        id: makeId('usage'),
        taskId: state.task.id ?? 'chat',
        taskLabel: state.task.title || 'Sohbet',
        agentRole: 'chat',
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimated: result.usage.estimated,
        purpose: 'chat',
        createdAt: Date.now(),
      };
      void bridge.usage.insert(record);
      void get().refreshUsage();

      pushChat(set, get, {
        id: makeId('msg'),
        role: 'assistant',
        content: result.text || '(boş yanıt)',
        createdAt: Date.now(),
        demo: result.demo,
        model: result.model,
        contextTokens: result.usage.promptTokens,
      });
    } catch (error) {
      pushChat(set, get, {
        id: makeId('msg'),
        role: 'assistant',
        error: true,
        content: error instanceof Error ? error.message : 'Sağlayıcı isteği başarısız oldu.',
        createdAt: Date.now(),
      });
    } finally {
      set({ chatBusy: false });
    }
  },

  async startTask(title) {
    const state = get();
    const trimmed = title.trim();
    if (!trimmed) return;
    if (!state.workspace) {
      get().notify('Görev başlatmak için önce bir proje klasörü açın.', 'warn');
      return;
    }
    if (state.task.status === 'running') {
      get().notify('Zaten çalışan bir görev var. Önce durdurun.', 'warn');
      return;
    }
    const taskId = makeId('task');
    await runTaskWith(get, set, taskId, trimmed);
  },

  stopTask() {
    taskControl.cancel();
    settleAllApprovals(false);
    set({
      approvals: get().approvals.map((approval) =>
        approval.status === 'pending' ? { ...approval, status: 'rejected' } : approval,
      ),
      agents: Object.fromEntries(
        Object.entries(get().agents).map(([role, agent]) => [
          role,
          agent.status === 'running' || agent.status === 'awaiting-approval'
            ? { ...agent, status: 'stopped' as AgentStatus, lastMessage: 'Durduruldu.' }
            : agent,
        ]),
      ) as Record<AgentRole, AgentNodeState>,
      task: { ...get().task, status: 'stopped' },
    });
    get().notify('Görev durduruldu.', 'warn');
  },

  approve(id) {
    settleApproval(id, true);
    set({
      approvals: get().approvals.map((approval) =>
        approval.id === id ? { ...approval, status: 'approved' } : approval,
      ),
    });
  },

  reject(id) {
    settleApproval(id, false);
    set({
      approvals: get().approvals.map((approval) =>
        approval.id === id ? { ...approval, status: 'rejected' } : approval,
      ),
    });
  },

  async acceptChange(id) {
    const change = get().changes.find((item) => item.id === id);
    if (!change) return;
    try {
      await bridge.workspace.saveFile(change.filePath, change.proposed);
      await bridge.index.notifySaved(change.filePath);
      set({
        changes: get().changes.map((item) =>
          item.id === id ? { ...item, status: 'accepted', error: undefined } : item,
        ),
        tabs: get().tabs.map((tab) =>
          tab.path === change.filePath
            ? { ...tab, content: change.proposed, savedContent: change.proposed, dirty: false }
            : tab,
        ),
      });
      void get().refreshTree();
      if (!get().changes.some((item) => item.status === 'pending')) {
        set({ task: { ...get().task, status: 'done' } });
      }
      get().notify(`${basename(change.filePath)} güncellendi.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dosya yazılamadı.';
      set({
        changes: get().changes.map((item) =>
          item.id === id ? { ...item, error: message } : item,
        ),
      });
      get().notify(message, 'error');
    }
  },

  rejectChange(id) {
    set({
      changes: get().changes.map((item) =>
        item.id === id ? { ...item, status: 'rejected' } : item,
      ),
    });
    if (!get().changes.some((item) => item.status === 'pending')) {
      set({ task: { ...get().task, status: 'done' } });
    }
  },

  async undoChange(id) {
    const change = get().changes.find((item) => item.id === id);
    if (!change) return;
    try {
      await bridge.workspace.saveFile(change.filePath, change.original);
      await bridge.index.notifySaved(change.filePath);
      set({
        changes: get().changes.map((item) =>
          item.id === id ? { ...item, undoneAt: Date.now() } : item,
        ),
        tabs: get().tabs.map((tab) =>
          tab.path === change.filePath
            ? { ...tab, content: change.original, savedContent: change.original, dirty: false }
            : tab,
        ),
      });
      void get().refreshTree();
      get().notify(`${basename(change.filePath)} eski haline döndürüldü.`, 'success');
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Geri alınamadı.', 'error');
    }
  },

  async acceptAllChanges() {
    const pending = get().changes.filter((item) => item.status === 'pending');
    for (const change of pending) {
      await get().acceptChange(change.id);
    }
  },

  rejectAllChanges() {
    set({
      changes: get().changes.map((item) =>
        item.status === 'pending' ? { ...item, status: 'rejected' } : item,
      ),
      task: { ...get().task, status: 'done' },
    });
  },

  openReview() {
    set({ reviewOpen: true });
  },
  closeReview() {
    set({ reviewOpen: false });
  },

  async refreshUsage() {
    try {
      const [usage, summary] = await Promise.all([bridge.usage.list(), bridge.usage.summary()]);
      set({ usage, usageSummaryData: summary });
    } catch {
      /* yoksay */
    }
  },

  async refreshProblems() {
    const path = get().activePath;
    if (!path) {
      set({ problems: [], problemsMessage: 'Tanılama için bir dosya açın.' });
      return;
    }
    set({ problemsLoading: true });
    try {
      const result = await bridge.lsp.diagnostics(path);
      set({
        problems: result.items,
        problemsMessage: result.message,
        problemsLoading: false,
      });
    } catch (error) {
      set({
        problems: [],
        problemsLoading: false,
        problemsMessage: error instanceof Error ? error.message : 'LSP isteği başarısız.',
      });
    }
  },

  setAgentModel(role, model) {
    if (!model) return;
    set({ agents: { ...get().agents, [role]: { ...get().agents[role], model } } });
    const settings = get().settings;
    void get().saveSettings({ agents: { ...settings.agents, [role]: { ...settings.agents[role], model } } });
  },

  setAgentName(role, name) {
    set({ agents: { ...get().agents, [role]: { ...get().agents[role], name } } });
  },

  setAgentRole(role, next) {
    if (role === next) return;
    const agents = { ...get().agents };
    const source = agents[role];
    const target = agents[next];
    agents[role] = { ...target, id: role, role, status: 'idle' };
    agents[next] = { ...source, id: next, role: next, status: 'idle' };
    set({ agents, edges: initialEdges });
    get().notify(
      `Roller yer değiştirdi: ${source.name} → ${next === 'planner' ? 'Planlayıcı' : next === 'coder' ? 'Kodlayıcı' : 'İnceleyici'}, ${target.name} → ${role === 'planner' ? 'Planlayıcı' : role === 'coder' ? 'Kodlayıcı' : 'İnceleyici'}.`,
      'info',
    );
  },

  async setProvider(provider) {
    const info = get().providerStatus?.providers.find((item) => item.id === provider);
    const model = provider === 'demo' ? DEMO_MODEL : info?.defaultModel ?? get().settings.model;
    const settings: AppSettings = {
      ...get().settings,
      provider,
      model,
      agents: {
        planner: { ...get().settings.agents.planner, model },
        coder: { ...get().settings.agents.coder, model },
        reviewer: { ...get().settings.agents.reviewer, model },
      },
    };
    set({
      settings,
      agents: initialAgents({ planner: model, coder: model, reviewer: model }),
    });
    const saved = await bridge.settings.set(settings);
    set({ settings: saved });
    if (provider === 'openai' && !get().providerStatus?.hasApiKey) {
      get().notify('OpenAI seçildi. İstek yapmadan önce API anahtarını kaydedin.', 'warn');
    }
  },

  async saveSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    try {
      const saved = await bridge.settings.set(next);
      set({ settings: saved });
    } catch (error) {
      get().notify(error instanceof Error ? error.message : 'Ayarlar kaydedilemedi.', 'error');
    }
  },

  async setApiKey(apiKey) {
    const result = await bridge.providers.setApiKey(apiKey);
    const providerStatus = await bridge.providers.status();
    set({ providerStatus });
    if (!result.ok) {
      get().notify(result.error ?? 'Anahtar kaydedilemedi.', 'error');
      return false;
    }
    get().notify('API anahtarı işletim sistemi kasasına şifreli olarak kaydedildi.', 'success');
    return true;
  },

  async clearApiKey() {
    await bridge.providers.clearApiKey();
    const providerStatus = await bridge.providers.status();
    set({ providerStatus });
    get().notify('API anahtarı silindi.', 'info');
  },

  notify(message, tone = 'info') {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set({ toast: { id, message, tone } });
    window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 4200);
  },

  dismissToast() {
    set({ toast: null });
  },
}));

/* ------------------------------------------------------------------ */
/* Görev yürütücüsünü mağazaya bağla                                   */
/* ------------------------------------------------------------------ */

async function runTaskWith(
  get: () => AppStore,
  set: (partial: Partial<AppState>) => void,
  taskId: string,
  title: string,
): Promise<void> {
  const state = get();
  if (!state.workspace) return;

  const taskMessage: ChatMessage = {
    id: makeId('msg'),
    role: 'user',
    content: title,
    createdAt: Date.now(),
    contextTokens: state.contextItems.reduce((sum, item) => sum + item.tokens, 0),
  };
  pushChat(set, get, taskMessage);

  set({
    task: { id: taskId, title, status: 'running' },
    changes: [],
    approvals: [],
    log: [],
    chatBusy: false,
    agents: initialAgents({
      planner: state.settings.agents.planner.model,
      coder: state.settings.agents.coder.model,
      reviewer: state.settings.agents.reviewer.model,
    }),
    edges: initialEdges,
  });

  const files = await collectTargetFiles(get());
  if (files.length === 0) {
    set({ task: { id: taskId, title, status: 'error' } });
    get().notify(
      'Bağlam için kaynak dosya bulunamadı. Proje indeksinin hazır olduğundan emin olun veya bağlama dosya ekleyin.',
      'warn',
    );
    return;
  }

  const log = (level: TaskLogEntry['level'], message: string, agent?: AgentRole) => {
    const entry: TaskLogEntry = {
      id: makeId('log'),
      at: Date.now(),
      level,
      message,
      agent,
    };
    set({ log: [...get().log.slice(-200), entry] });
  };

  const patchAgent = (id: AgentRole, patch: Partial<AgentNodeState>) => {
    set({ agents: { ...get().agents, [id]: { ...get().agents[id], ...patch } } });
  };

  const root = state.workspace.root;
  // Ajanlara mutlak yerel yollar gönderilmez; çalışma alanına göreli yollar gönderilir.
  const relativeFiles = files.map((file) => ({ ...file, path: relativeTo(root, file.path) }));

  const runtime: TaskRuntime = {
    api: bridge,
    settings: state.settings,
    workspace: state.workspace,
    context: state.contextItems,
    digest: buildWorkspaceDigest(state.index, state.workspace.name, state.contextItems),
    files: relativeFiles,
    indexFiles: state.index?.files ?? [],
    testCommand: detectTestCommand(state.tree),
    taskId,
    taskTitle: title,
    patchAgent,
    addStep(id, stepTitle, detail, status) {
      const agent = get().agents[id];
      patchAgent(id, {
        steps: [
          ...agent.steps,
          { id: makeId('step'), title: stepTitle, detail, status, at: Date.now() },
        ],
      });
    },
    setEdge(id, edgeState) {
      set({
        edges: get().edges.map((edge) => (edge.id === id ? { ...edge, state: edgeState } : edge)),
      });
    },
    addChange(input) {
      const absolute = resolveInWorkspace(root, input.filePath);
      if (!absolute) {
        log('warn', `Çalışma alanı dışındaki dosya reddedildi: ${input.filePath}`, 'coder');
        return false;
      }
      if (isSecretPath(absolute)) {
        log('warn', `Gizli dosya için değişiklik reddedildi: ${basename(absolute)}`, 'coder');
        return false;
      }
      const isNewFile = !get().index?.files.some((file) => file.path === absolute);
      const change: ProposedChange = {
        id: makeId('change'),
        taskId,
        filePath: absolute,
        agentRole: input.agentRole,
        summary: input.summary,
        original: input.original,
        proposed: input.proposed,
        isNewFile,
        status: 'pending',
        createdAt: Date.now(),
      };
      set({ changes: [...get().changes, change] });
      return true;
    },
    getChanges() {
      return get().changes;
    },
    async readFile(path) {
      const absolute = resolveInWorkspace(root, path);
      if (!absolute || isSecretPath(absolute)) return null;
      const result = await bridge.workspace.readFile(absolute);
      return result.error ? null : result.content;
    },
    relativePath(path) {
      return relativeTo(root, path);
    },
    async requestApproval(input) {
      const approval: PendingApproval = {
        id: makeId('approval'),
        taskId,
        type: input.type,
        from: input.from,
        title: input.title,
        description: input.description,
        command: input.command,
        targetRole: input.targetRole,
        status: 'pending',
        createdAt: Date.now(),
      };
      set({
        approvals: [...get().approvals, approval],
        agents: {
          ...get().agents,
          [input.from]: {
            ...get().agents[input.from],
            status: 'awaiting-approval',
            lastMessage: input.type === 'command' ? 'Komut onayı bekliyor' : 'Görev onayı bekliyor',
          },
        },
        task: { ...get().task, status: 'awaiting-approval' },
      });
      log('warn', `Onay bekleniyor: ${input.title}`, input.from);
      const approved = await awaitApproval(approval.id);
      set({
        approvals: get().approvals.map((item) =>
          item.id === approval.id
            ? { ...item, status: approved ? 'approved' : 'rejected' }
            : item,
        ),
        task: { ...get().task, status: taskControl.isCancelled() ? 'stopped' : 'running' },
      });
      return approved;
    },
    async addChat(message) {
      const full: ChatMessage = { ...message, id: makeId('msg'), createdAt: Date.now() };
      pushChat(set, get, full);
      return full;
    },
    setTaskStatus(status) {
      set({ task: { ...get().task, status } });
    },
    recordUsage(result, agent, purpose) {
      const record: UsageRecord = {
        id: makeId('usage'),
        taskId,
        taskLabel: title,
        agentRole: agent,
        provider: result.provider,
        model: result.model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimated: result.usage.estimated,
        purpose,
        createdAt: Date.now(),
      };
      void bridge.usage.insert(record).catch(() => undefined);
      set({ usage: [record, ...get().usage].slice(0, 300) });
      if (agent !== 'chat') {
        const node = get().agents[agent];
        patchAgent(agent, {
          tokens: node.tokens + result.usage.totalTokens,
          estimatedTokens: node.estimatedTokens + (result.usage.estimated ? result.usage.totalTokens : 0),
        });
      }
      void get().refreshUsage();
    },
    log,
    async runCommand(command) {
      const result = await bridge.terminal.run(state.workspace!.root, command);
      set({ bottomOpen: true, bottomTab: 'terminal' });
      return result;
    },
    hasPendingChanges() {
      return get().changes.some((change) => change.status === 'pending');
    },
  };

  try {
    await runTask(runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Görev çalıştırılamadı.';
    set({ task: { ...get().task, status: 'error' } });
    log('error', message);
    get().notify(message, 'error');
  } finally {
    if (get().task.status === 'running') {
      set({ task: { ...get().task, status: 'done' } });
    }
    void get().refreshUsage();
  }
}

/* ------------------------------------------------------------------ */
/* Ana süreç olayları                                                  */
/* ------------------------------------------------------------------ */

let subscribed = false;

function subscribeEvents(
  set: (partial: Partial<AppState>) => void,
  get: () => AppStore,
): void {
  if (subscribed) return;
  subscribed = true;

  bridge.events.onIndexProgress(({ progress }) => {
    set({ indexProgress: progress, indexBusy: progress.state === 'scanning' });
    if (progress.state === 'ready') void get().refreshSnapshot();
  });

  bridge.events.onMenuAction((action) => {
    switch (action) {
      case 'open-folder':
        void get().openFolderDialog();
        break;
      case 'open-sample':
        void get().openSample();
        break;
      case 'save':
        void get().saveActive();
        break;
      case 'toggle-terminal':
        get().toggleBottom();
        break;
      case 'open-settings':
        get().setView('settings');
        break;
      case 'open-usage':
        get().setView('usage');
        break;
      case 'open-graph':
        get().setView('graph');
        break;
      case 'open-map':
        get().setView('map');
        break;
      case 'open-editor':
        get().setView('editor');
        break;
    }
  });

  bridge.events.onFileChanged(({ path, type }) => {
    const tab = get().tabs.find((item) => item.path === path);
    if (!tab || type === 'unlink') return;
    if (tab.dirty) {
      get().notify(`${tab.name} diskte değişti; kaydedilmemiş değişiklikleriniz korunuyor.`, 'warn');
      return;
    }
    void bridge.workspace.readFile(path).then((result) => {
      if (result.error) return;
      set({
        tabs: get().tabs.map((item) =>
          item.path === path
            ? { ...item, content: result.content, savedContent: result.content, dirty: false }
            : item,
        ),
      });
    });
  });
}

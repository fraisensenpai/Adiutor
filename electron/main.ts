import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC, type MenuAction } from '../src/shared/ipc';
import type {
  AppSettings,
  ChatMessage,
  CompletionRequest,
  ContextRequest,
  ProviderId,
  UsageRecord,
} from '../src/shared/types';
import { isProviderId } from '../src/shared/settings';
import {
  appendChatMessage,
  clearChatMessages,
  databaseFilePath,
  getSettings,
  initDatabase,
  insertUsage,
  listUsage,
  loadChatMessages,
  saveSettings,
  usageSummary,
} from './services/db';
import {
  clearApiKey,
  encryptionAvailable,
  getApiKey,
  hasApiKey,
  initEncryption,
  keyStorageLabel,
  setApiKey,
} from './services/secrets';
import { getAdapter, ProviderFailure, providerInfos, providerStatus } from './services/providers';
import { projectIndex } from './services/indexer';
import { lspClient } from './services/lsp';
import { TerminalService } from './services/terminal';
import {
  assertInsideAllowedRoot,
  createSampleWorkspace,
  isSecretFile,
  readFileContent,
  readTree,
  registerRoot,
  revealInFolder,
  saveFileContent,
  workspaceInfo,
} from './services/workspace';

const isDev = Boolean(process.env.ADIUTOR_DEV_SERVER_URL);
const smokeMode = process.env.ADIUTOR_SMOKE ?? '';
const rendererConsole: string[] = [];
let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const terminal = new TerminalService(
  (payload) => mainWindow?.webContents.send(IPC.eventTerminalData, payload),
  (payload) => {
    mainWindow?.webContents.send(IPC.eventTerminalExit, payload);
    if (mainWindow && mainWindow.webContents.isDestroyed()) mainWindow = null;
  },
);

function rendererDist(): string {
  return path.join(app.getAppPath(), 'dist');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const root = rendererDist();
    const target = path.join(root, pathname);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const data = await fs.promises.readFile(target);
      const mime = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
      return new Response(new Uint8Array(data), { headers: { 'content-type': mime } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function send(action: MenuAction): void {
  mainWindow?.webContents.send(IPC.menuAction, action);
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Dosya',
      submenu: [
        { label: 'Proje klasörü aç…', accelerator: 'CmdOrCtrl+O', click: () => send('open-folder') },
        { label: 'Örnek projeyi aç', click: () => send('open-sample') },
        { type: 'separator' },
        { label: 'Kaydet', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: 'Çıkış' }]),
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { label: 'Editör', accelerator: 'CmdOrCtrl+1', click: () => send('open-editor') },
        { label: 'Görev Grafiği', accelerator: 'CmdOrCtrl+2', click: () => send('open-graph') },
        { label: 'Proje Haritası', accelerator: 'CmdOrCtrl+3', click: () => send('open-map') },
        { label: 'Kullanım', accelerator: 'CmdOrCtrl+4', click: () => send('open-usage') },
        { type: 'separator' },
        { label: 'Terminal panelini aç/kapat', accelerator: 'CmdOrCtrl+`', click: () => send('toggle-terminal') },
        { type: 'separator' },
        { role: 'reload', label: 'Yenile' },
        { role: 'toggleDevTools', label: 'Geliştirici araçları' },
        { type: 'separator' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
        { role: 'resetZoom', label: 'Normal boyut' },
      ],
    },
    {
      label: 'Ayarlar',
      submenu: [
        { label: 'Ayarlar…', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#0c0e12',
    title: 'Adiutor',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Otomatik testte pencere gizli kalır; gizli pencerede de boyanın sürmesi için gerekli.
      backgroundThrottling: false,
    },
  });

  if (!isDev) window.setMenuBarVisibility(false);

  window.once('ready-to-show', () => {
    // Test çalıştırması kullanıcının masaüstünde pencere açıp kendi kendine işlem yapmış gibi görünmesin.
    if (!smokeMode) window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('console-message', (event) => {
    const message = typeof event === 'object' && event !== null && 'message' in event
      ? String((event as { message?: unknown }).message ?? '')
      : '';
    if (process.env.ADIUTOR_DEBUG || smokeMode) {
      console.log(`[renderer] ${message}`);
      rendererConsole.push(message);
    }
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] süreç kapandı:', details.reason);
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[renderer] yükleme başarısız (${code}): ${description}`);
  });

  if (isDev) {
    void window.loadURL(process.env.ADIUTOR_DEV_SERVER_URL!);
  } else {
    void window.loadURL('app://adiutor/index.html');
  }

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  return window;
}

function setupIndexListeners(): void {
  projectIndex.setListeners(
    (root, progress) => mainWindow?.webContents.send(IPC.eventIndexProgress, { root, progress }),
    (change) => mainWindow?.webContents.send(IPC.eventFileChanged, change),
  );
}

function registerIpc(): void {
  const inFlight = new Map<string, AbortController>();

  ipcMain.handle(IPC.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    parser: `${projectIndex.snapshot().parserNote}`,
  }));

  /* --------------------------- çalışma alanı --------------------------- */
  ipcMain.handle(IPC.openFolderDialog, async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Adiutor — proje klasörü seç',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const root = result.filePaths[0];
    registerRoot(root);
    return workspaceInfo(root);
  });

  ipcMain.handle(IPC.openFolderPath, async (_event, target: string) => {
    const stat = await fs.promises.stat(target);
    if (!stat.isDirectory()) throw new Error('Seçilen yol bir klasör değil.');
    registerRoot(target);
    return workspaceInfo(target);
  });

  ipcMain.handle(IPC.createSampleWorkspace, async () => createSampleWorkspace());

  ipcMain.handle(IPC.readTree, async (_event, root: string) => readTree(root));
  ipcMain.handle(IPC.readFile, async (_event, target: string) => readFileContent(target));
  ipcMain.handle(IPC.saveFile, async (_event, target: string, content: string) => {
    const result = await saveFileContent(target, content);
    projectIndex.notifySaved(result.path);
    return result;
  });
  ipcMain.handle(IPC.revealPath, async (_event, target: string) => revealInFolder(target));

  /* ----------------------------- indeks ----------------------------- */
  ipcMain.handle(IPC.indexSnapshot, async (_event, root: string) => {
    const current = projectIndex.getRoot();
    const status = projectIndex.getStatus();
    if (current !== root || status.state === 'idle' || status.state === 'error') {
      void projectIndex
        .scan(root)
        .then(() => projectIndex.setLspStatus(lspClient.getStatus()))
        .catch((error: Error) => {
          console.error('[index] tarama hatası:', error.message);
        });
    }
    return projectIndex.snapshot();
  });

  ipcMain.handle(IPC.indexReindex, async (_event, root: string) => {
    void projectIndex.scan(root).catch((error: Error) => {
      console.error('[index] tarama hatası:', error.message);
    });
    return projectIndex.snapshot();
  });

  ipcMain.handle(IPC.indexRelations, async (_event, root: string, symbolId: string) => {
    if (projectIndex.getRoot() !== root) await projectIndex.scan(root);
    return projectIndex.relations(symbolId);
  });

  ipcMain.handle(IPC.indexContext, async (_event, root: string, request: ContextRequest) => {
    if (projectIndex.getRoot() !== root) await projectIndex.scan(root);
    return projectIndex.buildContext(request);
  });

  ipcMain.handle(IPC.indexApply, async (_event, target: string) => {
    const resolved = assertInsideAllowedRoot(target);
    if (!isSecretFile(resolved)) projectIndex.notifySaved(resolved);
  });

  /* ------------------------------- LSP ------------------------------- */
  ipcMain.handle(IPC.lspDiagnostics, async (_event, target: string) => {
    const resolved = assertInsideAllowedRoot(target);
    const root = projectIndex.getRoot() || path.dirname(resolved);
    const status = await lspClient.ensureStarted(root);
    projectIndex.setLspStatus(status);
    const items = status.running ? await lspClient.diagnosticsFor(resolved) : [];
    return { available: status.available, running: status.running, message: status.message, items };
  });

  /* --------------------------- sağlayıcılar --------------------------- */
  ipcMain.handle(IPC.providerStatus, () => providerStatus());

  ipcMain.handle(IPC.providerComplete, async (_event, request: CompletionRequest) => {
    const adapter = getAdapter(request.provider);
    const controller = new AbortController();
    inFlight.set(request.requestId, controller);
    try {
      const result = await adapter.complete(request, {
        apiKey: adapter.info.requiresApiKey ? getApiKey(request.provider) : null,
        hasStoredKey: adapter.info.requiresApiKey ? hasApiKey(request.provider) : false,
        signal: controller.signal,
      });
      return result;
    } catch (error) {
      if (error instanceof ProviderFailure) {
        throw new Error(error.message);
      }
      throw new Error('Sağlayıcı isteği başarısız oldu.');
    } finally {
      inFlight.delete(request.requestId);
    }
  });

  ipcMain.handle(IPC.providerCancel, async (_event, requestId: string) => {
    inFlight.get(requestId)?.abort();
    inFlight.delete(requestId);
  });

  ipcMain.handle(IPC.secretSet, async (_event, provider: ProviderId, apiKey: string) => {
    if (!isProviderId(provider)) return { ok: false, error: 'Bilinmeyen sağlayıcı.' };
    return setApiKey(provider, apiKey);
  });
  ipcMain.handle(IPC.secretClear, async (_event, provider: ProviderId) => {
    if (isProviderId(provider)) clearApiKey(provider);
  });

  /* ---------------------------- kullanım ---------------------------- */
  ipcMain.handle(IPC.usageList, async () => listUsage());
  ipcMain.handle(IPC.usageSummary, async () => usageSummary());
  ipcMain.handle(IPC.usageInsert, async (_event, record: UsageRecord) => insertUsage(record));

  /* ---------------------------- ayarlar ----------------------------- */
  ipcMain.handle(IPC.settingsGet, async () => getSettings());
  ipcMain.handle(IPC.settingsSet, async (_event, settings: AppSettings) => saveSettings(settings));

  /* ----------------------------- sohbet ----------------------------- */
  ipcMain.handle(IPC.chatLoad, async () => loadChatMessages());
  ipcMain.handle(IPC.chatAppend, async (_event, message: ChatMessage) => appendChatMessage(message));
  ipcMain.handle(IPC.chatClear, async () => clearChatMessages());

  /* ---------------------------- terminal ---------------------------- */
  ipcMain.handle(IPC.terminalStart, async (_event, cwd: string) => terminal.start(cwd));
  ipcMain.handle(IPC.terminalWrite, async (_event, sessionId: string, data: string) =>
    terminal.write(sessionId, data),
  );
  ipcMain.handle(IPC.terminalKill, async (_event, sessionId: string) => terminal.kill(sessionId));
  ipcMain.handle(IPC.terminalRun, async (_event, cwd: string, command: string) =>
    terminal.runOnce(cwd, command),
  );
}

/**
 * Smoke testi, gerçek adaptörü ağ olmadan sürer: yalnızca smoke sürecinde
 * OpenAI uç noktasına giden istekler yerel olarak yanıtlanır. Kullanıcı
 * akışında görünmez; uygulama kodu değişmez.
 */
function installSmokeFetch(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes('api.openai.com')) return realFetch(input, init);

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      messages?: Array<{ role: string; content: string }>;
    };
    const system = body.messages?.find((message) => message.role === 'system')?.content ?? '';
    const user = body.messages?.find((message) => message.role === 'user')?.content ?? '';

    let content = 'Smoke yanıtı.';
    if (system.includes('Planlayıcı ajan')) {
      content = JSON.stringify({
        summary: 'Smoke testi için plan hazırlandı.',
        steps: [
          { title: 'Bağlamı çıkar', detail: 'İndeks özeti okunur.' },
          { title: 'Kodu değiştir', detail: 'Diff önerisi üretilir.' },
        ],
        assignments: [
          {
            role: 'coder',
            title: 'Smoke: yardımcı fonksiyon ekle',
            instructions: 'Bağlamdaki ilk dosyaya küçük bir yardımcı fonksiyon ekle.',
          },
        ],
      });
    } else if (system.includes('Kodlayıcı ajan')) {
      const jsonStart = user.indexOf('BAĞLAM (JSON):');
      const raw = jsonStart >= 0 ? user.slice(jsonStart + 'BAĞLAM (JSON):'.length).trim() : '{}';
      let file: { path?: string; content?: string } = {};
      try {
        const parsed = JSON.parse(raw) as { files?: Array<{ path?: string; content?: string }> };
        file = parsed.files?.[0] ?? {};
      } catch {
        file = {};
      }
      content = JSON.stringify({
        summary: 'Smoke testi: tek dosyada küçük bir ekleme önerildi.',
        changes: file.path
          ? [
              {
                filePath: file.path,
                newContent: `${file.content ?? ''}\n\nexport function smokeYardimcisi(value: string): string {\n  return value.trim();\n}\n`,
                summary: 'Smoke yardımcı fonksiyonu eklendi.',
              },
            ]
          : [],
      });
    } else if (system.includes('İnceleyici ajan')) {
      content = JSON.stringify({
        verdict: 'onayla',
        notes: 'Smoke incelemesi: değişiklik kapsamı dar ve geri alınabilir.',
        issues: [],
        command: { command: 'echo adiutor-smoke-ok', reason: 'Değişikliği doğrulamak için.' },
      });
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as typeof fetch;
}

async function runSmoke(window: BrowserWindow, depth: 'basic' | 'deep'): Promise<void> {
  const outDir = path.join(app.getAppPath(), '.smoke');
  await fs.promises.mkdir(outDir, { recursive: true });
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  await wait(1800);
  const shot = await window.webContents.capturePage();
  await fs.promises.writeFile(path.join(outDir, 'app-empty.png'), shot.toPNG());
  console.log('[smoke] boş durum ekran görüntüsü alındı');

  if (depth === 'deep') {
    const info = await createSampleWorkspace();
    console.log('[smoke] örnek proje:', info.root);
    const snapshot = await projectIndex.scan(info.root);
    console.log(
      `[smoke] indeks: ${snapshot.files.length} dosya, ${snapshot.symbols.length} sembol, ayrıştırıcı=${snapshot.parser}`,
    );
    const context = await projectIndex.buildContext({
      paths: snapshot.files.slice(0, 2).map((file) => file.path),
      maxTokens: 4000,
    });
    console.log(`[smoke] bağlam: ${context.items.length} parça, ~${context.totalTokens} token`);

    installSmokeFetch();
    const summary = usageSummary();
    console.log(`[smoke] kayıtlı kullanım: ${summary.requestCount} istek, ${summary.totalTokens} token`);
    console.log(
      `[smoke] sağlayıcılar: ${providerInfos()
        .map((provider) => `${provider.id}=${getApiKey(provider.id) ? 'anahtarlı' : 'anahtarsız'}`)
        .join(', ')}`,
    );
    console.log(`[smoke] sqlite: ${databaseFilePath()}`);
    console.log(`[smoke] güvenli kasa: ${encryptionAvailable() ? 'kullanılabilir' : 'kullanılamıyor'} (${keyStorageLabel()})`);
    console.log(`[smoke] openai anahtarı kayıtlı: ${hasApiKey('openai')}`);

    const commandResult = await terminal.runOnce(info.root, "echo adiutor-smoke-ok");
    console.log(
      `[smoke] terminal komutu çıkış=${commandResult.code} çıktı="${commandResult.output.trim()}" (${commandResult.durationMs} ms)`,
    );

    const capture = async (name: string) => {
      await fs.promises.writeFile(
        path.join(outDir, name),
        (await window.webContents.capturePage()).toPNG(),
      );
    };

    const clickText = async (selector: string, text: string): Promise<boolean> =>
      Boolean(
        await window.webContents.executeJavaScript(`(() => {
          const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
          const el = nodes.find((node) => (node.textContent || '').includes(${JSON.stringify(text)}));
          if (!el) return false;
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        })()`),
      );

    const waitFor = async (selector: string, text: string, timeoutMs = 15000): Promise<boolean> => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const found = await window.webContents.executeJavaScript(`(() => {
          const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
          return nodes.some((node) => (node.textContent || '').includes(${JSON.stringify(text)}));
        })()`);
        if (found) return true;
        await wait(250);
      }
      return false;
    };

    // Arayüzü gerçek kullanıcı eylemleriyle sür: dosya aç → görev başlat → onayla → diff.
    send('open-sample');
    await wait(3200);
    await clickText('.tree-row', 'src');
    await wait(300);
    await clickText('.tree-row', 'tasks.ts');
    await wait(1600);
    const hasEditor = await window.webContents.executeJavaScript(
      "!!document.querySelector('.monaco-editor')",
    );
    console.log(`[smoke] monaco editör yüklendi: ${hasEditor}`);
    await capture('app-editor.png');

    const contextClick = await window.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('.tree-actions button');
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await wait(900);
    const chipCount = (await window.webContents.executeJavaScript(
      "document.querySelectorAll('.chip').length",
    )) as number;
    console.log(`[smoke] dosya bağlama eklendi: ${contextClick} · bağlam yongası: ${chipCount}`);

    const typed = await window.webContents.executeJavaScript(`(() => {
      const area = document.querySelector('.composer textarea');
      if (!area) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, 'Görev başlığını kısalt ve yardımcı fonksiyon ekle');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    console.log(`[smoke] görev yazıldı: ${typed}`);
    await wait(400);
    console.log(`[smoke] görev başlatıldı: ${await clickText('.composer button', 'Görevi başlat')}`);

    const taskApproval = await waitFor('.approval-card', 'Görevi onayla');
    console.log(`[smoke] görev onayı istendi: ${taskApproval}`);
    await capture('app-approval.png');
    await clickText('.approval-card button', 'Görevi onayla');
    await wait(1400);

    const commandApproval = await waitFor('.approval-card', 'Çalıştırmayı onayla', 15000);
    console.log(`[smoke] komut onayı istendi: ${commandApproval}`);
    if (commandApproval) {
      await clickText('.approval-card button', 'Çalıştırmayı onayla');
      await wait(3000);
    }

    const reviewReady = await waitFor('.titlebar button', 'Değişiklikleri incele', 15000);
    console.log(`[smoke] diff hazır: ${reviewReady}`);

    const remainingMessages = (await window.webContents.executeJavaScript(`(async () => {
      await window.adiutor.chat.clear();
      const messages = await window.adiutor.chat.load();
      return messages.length;
    })()`)) as number;
    console.log(
      `[smoke] sohbet temizleme: ${remainingMessages === 0 ? 'çalışıyor' : `başarısız (${remainingMessages} mesaj kaldı)`}`,
    );
    await capture('app-chat.png');

    if (reviewReady) {
      await clickText('.titlebar button', 'Değişiklikleri incele');
      await wait(800);
      await capture('app-review.png');
      const applied = await clickText('.review-toolbar button', 'Kabul et ve yaz');
      await wait(800);
      console.log(`[smoke] değişiklik kabul edildi: ${applied}`);
      await capture('app-review-applied.png');
      await clickText('.modal-footer button', 'Kapat');
      await wait(500);
    }

    send('open-graph');
    await wait(900);
    await capture('app-graph.png');
    send('open-map');
    await wait(900);
    await capture('app-map.png');
    send('open-usage');
    await wait(900);
    await capture('app-usage.png');
    send('open-settings');
    await wait(900);
    await capture('app-settings.png');
    console.log(
      '[smoke] son görünüm başlığı:',
      await window.webContents.executeJavaScript(
        "document.querySelector('.view-title')?.textContent || '(yok)'",
      ),
    );

    const metrics = (await window.webContents.executeJavaScript(`({
      messages: document.querySelectorAll('.msg').length,
      agentCards: document.querySelectorAll('.agent-card').length,
      diffRows: document.querySelectorAll('.diff-row').length,
      rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    })`)) as Record<string, number>;
    console.log('[smoke] arayüz metrikleri:', JSON.stringify(metrics));
    if (!metrics.rootChildren) throw new Error('Arayüz kökü boş; renderer yüklenemedi.');
  }

  const errors = rendererConsole.filter((line) => /error|uncaught|failed/i.test(line));
  console.log(`[smoke] renderer konsolu: ${rendererConsole.length} satır, ${errors.length} hata benzeri`);
  for (const line of rendererConsole.slice(-20)) console.log(`  · ${line}`);
  app.exit(errors.length > 0 ? 1 : 0);
}

async function bootstrap(): Promise<void> {
  app.setName('Adiutor');
  app.setAppUserModelId('com.adiutor.app');
  initDatabase();
  await initEncryption();
  registerAppProtocol();
  setupIndexListeners();
  registerIpc();
  buildMenu();

  mainWindow = createWindow();

  if (smokeMode) {
    await setApiKey('openai', 'sk-smoke-test-key');
    mainWindow.webContents.once('did-finish-load', () => {
      void runSmoke(mainWindow!, smokeMode === 'deep' ? 'deep' : 'basic').catch((error: Error) => {
        console.error('[smoke] hata:', error.message);
        app.exit(1);
      });
    });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    await bootstrap();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  terminal.killAll();
  lspClient.dispose();
  projectIndex.stopWatcher();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  terminal.killAll();
  lspClient.dispose();
});

process.on('uncaughtException', (error) => {
  console.error('[main] beklenmeyen hata:', error.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[main] işlenmeyen söz reddi:', reason instanceof Error ? reason.message : String(reason));
});

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { LspStatus } from '../../src/shared/types';

/**
 * İsteğe bağlı LSP istemcisi.
 *
 * İlk sürümde LSP zorunlu değil: `typescript-language-server` projede kuruluysa
 * (veya PATH'te bulunuyorsa) TypeScript/JavaScript dosyaları için tanılamalar
 * alınır. Sunucu yoksa arayüz bunu açıkça "kullanılamıyor" olarak gösterir;
 * hiçbir zaman çalışıyormuş gibi yapılmaz.
 */

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface LspDiagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  source?: string;
}

const SEVERITY: Record<number, LspDiagnostic['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

export class LspClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private diagnostics = new Map<string, LspDiagnostic[]>();
  private status: LspStatus = {
    available: false,
    running: false,
    message: 'LSP sunucusu aranmadı.',
  };
  private starting: Promise<LspStatus> | null = null;
  private opened = new Set<string>();

  getStatus(): LspStatus {
    return this.status;
  }

  private serverEntry(): string | null {
    const candidates = [
      path.join(app.getAppPath(), 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
      path.join(app.getAppPath(), 'node_modules', 'typescript-language-server', 'lib', 'cli.js'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private pathServer(): string | null {
    const dirs = (process.env.PATH ?? '').split(path.delimiter);
    const names =
      process.platform === 'win32'
        ? ['typescript-language-server.cmd', 'typescript-language-server.exe']
        : ['typescript-language-server'];
    for (const dir of dirs) {
      for (const name of names) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return null;
  }

  async ensureStarted(root: string): Promise<LspStatus> {
    if (this.status.running) return this.status;
    if (this.starting) return this.starting;
    this.starting = this.start(root).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(root: string): Promise<LspStatus> {
    const entry = this.serverEntry();
    const binary = entry ? null : this.pathServer();
    if (!entry && !binary) {
      this.status = {
        available: false,
        running: false,
        message:
          'LSP sunucusu bulunamadı. Etkinleştirmek için projeye `typescript-language-server` kurun; Adiutor çalışma zamanında algılar.',
      };
      return this.status;
    }

    try {
      const child = entry
        ? spawn(process.execPath, [entry, '--stdio'], {
            cwd: root,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: 'pipe',
          })
        : spawn(binary!, ['--stdio'], { cwd: root, stdio: 'pipe', shell: true });
      this.process = child as ChildProcessWithoutNullStreams;
      this.attach(child as ChildProcessWithoutNullStreams);

      const init = await this.request(
        'initialize',
        {
          processId: process.pid,
          rootUri: `file://${root.replace(/\\/g, '/')}`,
          capabilities: {
            textDocument: { publishDiagnostics: { relatedInformation: true } },
          },
          workspaceFolders: [{ uri: `file://${root.replace(/\\/g, '/')}`, name: path.basename(root) }],
        },
        8000,
      );
      void init;
      this.notify('initialized', {});
      this.status = {
        available: true,
        running: true,
        server: 'typescript-language-server',
        message: 'LSP bağlı: typescript-language-server (stdio).',
      };
    } catch {
      this.process?.kill();
      this.process = null;
      this.status = {
        available: true,
        running: false,
        message: 'LSP sunucusu başlatılamadı; tanılamalar devre dışı.',
      };
    }
    return this.status;
  }

  private attach(child: ChildProcessWithoutNullStreams): void {
    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    child.stderr.on('data', () => {
      /* stderr loglanmaz: sunucu çıktısı kullanıcıya gösterilmez */
    });
    child.on('exit', () => {
      this.process = null;
      this.status = {
        available: true,
        running: false,
        message: 'LSP sunucusu kapandı.',
      };
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('LSP kapandı'));
      }
      this.pending.clear();
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      try {
        this.dispatch(JSON.parse(body) as Record<string, unknown>);
      } catch {
        /* bozuk mesajı yoksay */
      }
    }
  }

  private dispatch(message: Record<string, unknown>): void {
    if (typeof message.method === 'string' && message.id === undefined) {
      if (message.method === 'textDocument/publishDiagnostics') {
        const params = message.params as {
          uri?: string;
          diagnostics?: Array<{
            range?: { start?: { line?: number; character?: number } };
            severity?: number;
            message?: string;
            source?: string;
          }>;
        };
        const uri = params?.uri ?? '';
        const filePath = decodeURIComponent(uri.replace(/^file:\/\//, '').replace(/\//g, path.sep));
        const items: LspDiagnostic[] = (params?.diagnostics ?? []).map((diagnostic) => ({
          line: (diagnostic.range?.start?.line ?? 0) + 1,
          column: (diagnostic.range?.start?.character ?? 0) + 1,
          severity: SEVERITY[diagnostic.severity ?? 1] ?? 'error',
          message: diagnostic.message ?? '',
          source: diagnostic.source,
        }));
        this.diagnostics.set(path.normalize(filePath), items);
      }
      return;
    }
    const id = typeof message.id === 'number' ? message.id : null;
    if (id === null) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error('LSP isteği başarısız'));
    else pending.resolve(message.result);
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.process?.stdin.writable) return;
    const body = JSON.stringify(payload);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  }

  private request(method: string, params: unknown, timeoutMs = 5000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP zaman aşımı: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  async diagnosticsFor(filePath: string): Promise<LspDiagnostic[]> {
    if (!this.status.running) return [];
    const normalized = path.normalize(filePath);
    if (!this.opened.has(normalized)) {
      try {
        const text = fs.readFileSync(normalized, 'utf8');
        this.opened.add(normalized);
        this.notify('textDocument/didOpen', {
          textDocument: {
            uri: `file://${normalized.replace(/\\/g, '/')}`,
            languageId: normalized.endsWith('.py') ? 'python' : 'typescript',
            version: 1,
            text,
          },
        });
      } catch {
        return [];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
    return this.diagnostics.get(normalized) ?? [];
  }

  dispose(): void {
    this.process?.kill();
    this.process = null;
  }
}

export const lspClient = new LspClient();

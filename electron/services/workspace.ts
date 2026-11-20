import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import type {
  FileReadResult,
  FileTreeNode,
  Language,
  WorkspaceInfo,
} from '../../src/shared/types';

/** Erişime izin verilen çalışma alanı kökleri (kullanıcı diyalogla açtı). */
const allowedRoots = new Set<string>();

export function registerRoot(root: string): void {
  allowedRoots.add(path.resolve(root));
}

export function assertInsideAllowedRoot(target: string): string {
  const resolved = path.resolve(target);
  for (const root of allowedRoots) {
    const relative = path.relative(root, resolved);
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return resolved;
    }
  }
  throw new Error('Bu yol açılmış bir proje klasörünün dışında.');
}

export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'dist-electron',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  '.idea',
  '.vscode',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'target',
  'vendor',
  'Pods',
]);

/** Gizli dosya desenleri: AI bağlamına asla dahil edilmez. */
const SECRET_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.crt$/i,
  /\.cer$/i,
  /\.keystore$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.npmrc$/i,
  /^\.netrc$/i,
  /^credentials?(\..*)?$/i,
  /^secrets?(\..*)?$/i,
  /\.kdbx$/i,
];

export function isSecretFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return SECRET_PATTERNS.some((pattern) => pattern.test(base));
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.svgz',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar', '.exe', '.dll', '.so', '.dylib',
  '.node', '.wasm', '.class', '.jar', '.pyc', '.pyo', '.o', '.a', '.lib', '.obj',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg', '.woff', '.woff2', '.ttf', '.otf',
  '.sqlite', '.db', '.lock',
]);

export function isBinaryPath(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function languageOf(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    case '.py':
    case '.pyi':
      return 'python';
    default:
      return 'other';
  }
}

export function isIndexablePath(filePath: string): boolean {
  const language = languageOf(filePath);
  return language !== 'other';
}

/** Proje ağacı. Sınırlı derinlik/öğe sayısı ile döner; UI tarafında katlanır. */
export async function readTree(root: string): Promise<FileTreeNode> {
  const resolvedRoot = assertInsideAllowedRoot(root);
  const MAX_ENTRIES = 5000;
  const MAX_DEPTH = 12;
  let entries = 0;

  async function walk(dir: string, depth: number): Promise<FileTreeNode[]> {
    if (depth > MAX_DEPTH || entries > MAX_ENTRIES) return [];
    let dirents: import('node:fs').Dirent[];
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    dirents.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'tr');
    });

    const nodes: FileTreeNode[] = [];
    for (const dirent of dirents) {
      if (entries >= MAX_ENTRIES) break;
      const full = path.join(dir, dirent.name);
      if (dirent.isSymbolicLink()) continue;
      if (dirent.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(dirent.name)) continue;
        entries += 1;
        const children = await walk(full, depth + 1);
        nodes.push({ name: dirent.name, path: full, type: 'directory', children });
      } else if (dirent.isFile()) {
        entries += 1;
        nodes.push({ name: dirent.name, path: full, type: 'file' });
      }
    }
    return nodes;
  }

  const children = await walk(resolvedRoot, 0);
  return {
    name: path.basename(resolvedRoot),
    path: resolvedRoot,
    type: 'directory',
    children,
    truncated: entries > MAX_ENTRIES,
  };
}

export async function readFileContent(target: string): Promise<FileReadResult> {
  const filePath = assertInsideAllowedRoot(target);
  const language = languageOf(filePath);
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 2 * 1024 * 1024) {
      return {
        path: filePath,
        content: '',
        language,
        error: 'Dosya 2 MB sınırından büyük; editörde açılmadı.',
      };
    }
    const buffer = await fs.readFile(filePath);
    if (buffer.subarray(0, 8192).includes(0)) {
      return { path: filePath, content: '', language, error: 'İkili dosya; metin olarak açılamaz.' };
    }
    return { path: filePath, content: buffer.toString('utf8'), language };
  } catch (error) {
    return {
      path: filePath,
      content: '',
      language,
      error: error instanceof Error ? error.message : 'Dosya okunamadı.',
    };
  }
}

export async function saveFileContent(target: string, content: string): Promise<{ path: string; bytes: number }> {
  const filePath = assertInsideAllowedRoot(target);
  await fs.writeFile(filePath, content, 'utf8');
  const buffer = Buffer.byteLength(content, 'utf8');
  return { path: filePath, bytes: buffer };
}

export function revealInFolder(target: string): void {
  const filePath = assertInsideAllowedRoot(target);
  shell.showItemInFolder(filePath);
}

/** Kullanıcıya gösterilen proje adı. */
export function workspaceInfo(root: string): WorkspaceInfo {
  return { root, name: path.basename(root) };
}

/* ------------------------------------------------------------------ */
/* Örnek proje (ajan akışını anında denemek için)                      */
/* ------------------------------------------------------------------ */

const SAMPLE_FILES: Record<string, string> = {
  'package.json': `{
  "name": "adiutor-ornek-proje",
  "private": true,
  "version": "1.0.0",
  "description": "Adiutor ajan akışını denemek için hazırlanmış küçük bir proje",
  "type": "module",
  "scripts": {
    "test": "node tests/tasks.test.mjs"
  }
}
`,
  'README.md': `# Örnek Proje

Bu klasör, **Adiutor**'un ajan akışını gerçek dosyalar üzerinde denemek için
otomatik oluşturuldu. Değişiklikler gerçek dosyalara yazılır; istediğiniz zaman
**Geri al** ile eski haline döndürebilirsiniz.

Dosyalar:

- \`src/tasks.ts\` — görev listesi ve filtreleme
- \`src/format.ts\` — biçimlendirme yardımcıları
- \`tests/tasks.test.mjs\` — basit test betiği
- \`python/analyzer.py\` — Python tarafında örnek analiz
`,
  'src/tasks.ts': `/**
 * Görev deposu: küçük, bağımlılıksız bir görev listesi modeli.
 */

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  tags: string[];
}

export class TaskStore {
  private tasks: Task[] = [];
  private sequence = 0;

  add(title: string, tags: string[] = []): Task {
    const task: Task = {
      id: \`task-\${++this.sequence}\`,
      title: title.trim(),
      status: 'todo',
      createdAt: Date.now(),
      tags,
    };
    this.tasks.push(task);
    return task;
  }

  setStatus(id: string, status: TaskStatus): Task | undefined {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return undefined;
    task.status = status;
    return task;
  }

  all(): Task[] {
    return [...this.tasks];
  }

  byStatus(status: TaskStatus): Task[] {
    return this.tasks.filter((task) => task.status === status);
  }
}

export function countByStatus(tasks: Task[]): Record<TaskStatus, number> {
  return tasks.reduce<Record<TaskStatus, number>>(
    (acc, task) => {
      acc[task.status] += 1;
      return acc;
    },
    { todo: 0, doing: 0, done: 0 },
  );
}
`,
  'src/format.ts': `import type { Task } from './tasks';

/** Başlığı sabit genişlikte kısaltır; Türkçe karakterleri bozmadan çalışır. */
export function truncate(value: string, max = 48): string {
  if (value.length <= max) return value;
  return \`\${value.slice(0, Math.max(0, max - 1))}…\`;
}

export function formatTask(task: Task): string {
  return \`[\${task.status.toUpperCase()}] \${truncate(task.title)}\`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return \`\${ms} ms\`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return \`\${seconds} sn\`;
  return \`\${Math.floor(seconds / 60)} dk \${seconds % 60} sn\`;
}
`,
  'tests/tasks.test.mjs': `import assert from 'node:assert/strict';
// Node 22.18+ / 24, tip açıklamalarını çalıştırırken ayıklar; ayrı derleme gerekmez.
import { TaskStore, countByStatus } from '../src/tasks.ts';

const store = new TaskStore();
const first = store.add('İlk görev', ['tasarım']);
store.add('İkinci görev');

assert.equal(store.all().length, 2, 'iki görev eklenmeli');
store.setStatus(first.id, 'done');
assert.deepEqual(countByStatus(store.all()), { todo: 1, doing: 0, done: 1 });

console.log('Tüm testler geçti.');
`,
  'python/analyzer.py': `"""Görev listesi için küçük bir metin analizi yardımcısı (örnek)."""

from dataclasses import dataclass


@dataclass
class Task:
    title: str
    done: bool = False
    tags: tuple[str, ...] = ()


def open_tasks(tasks: list[Task]) -> list[Task]:
    """Tamamlanmamış görevleri döndürür."""
    return [task for task in tasks if not task.done]


def tag_counts(tasks: list[Task]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for task in tasks:
        for tag in task.tags:
            counts[tag] = counts.get(tag, 0) + 1
    return counts


def summarize(tasks: list[Task]) -> str:
    open_count = len(open_tasks(tasks))
    return f"{open_count} açık görev, {len(tasks)} toplam görev"
`,
  '.gitignore': `node_modules/
*.log
`,
};

/** Örnek projeyi kullanıcı veri klasöründe oluşturur ve açar. */
export async function createSampleWorkspace(): Promise<WorkspaceInfo> {
  const root = path.join(app.getPath('userData'), 'ornek-proje');
  for (const [relative, content] of Object.entries(SAMPLE_FILES)) {
    const target = path.join(root, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (!fsSync.existsSync(target)) {
      await fs.writeFile(target, content, 'utf8');
    }
  }
  registerRoot(root);
  return workspaceInfo(root);
}

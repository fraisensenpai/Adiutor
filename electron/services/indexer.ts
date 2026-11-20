import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type {
  ContextBundle,
  ContextItem,
  ContextRequest,
  IndexProgress,
  IndexSnapshot,
  IndexedFile,
  IndexedSymbol,
  Language,
  LspStatus,
  SymbolKind,
  SymbolReference,
  SymbolRelations,
} from '../../src/shared/types';
import { estimateTokens } from '../../src/shared/tokens';
import {
  IGNORED_DIRECTORIES,
  isBinaryPath,
  isIndexablePath,
  isSecretFile,
  languageOf,
} from './workspace';

/**
 * Yerel proje indeksi.
 *
 * - Dosyalar taranır, Tree-sitter (WASM) ile sembol/import bilgisi çıkarılır.
 * - Tanım → kullanım ilişkisi için dosya başına tanımlayıcı (identifier)
 *   konumları tutulur.
 * - Tree-sitter yüklenemezse sadeleştirilmiş (regex tabanlı) çıkarıma düşer ve
 *   bunu arayüzde açıkça bildirir.
 * - Dosya değişikliklerinde yalnızca ilgili dosya yeniden indekslenir.
 */

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 4000;
const MAX_SYMBOLS_IN_SNAPSHOT = 8000;
const MAX_REFERENCES = 120;

interface IdentifierRef {
  name: string;
  line: number;
  column: number;
}

interface ParsedFile {
  path: string;
  language: Language;
  size: number;
  lines: number;
  symbols: IndexedSymbol[];
  imports: string[];
  identifiers: IdentifierRef[];
  parseError?: string;
  updatedAt: number;
}

interface TsNode {
  type: string;
  text: string;
  namedChildCount: number;
  namedChild(index: number): TsNode | null;
  childForFieldName(name: string): TsNode | null;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  parent: TsNode | null;
}

interface TsTree {
  rootNode: TsNode;
  delete(): void;
}

interface TsParser {
  setLanguage(language: unknown): void;
  parse(text: string): TsTree;
  delete(): void;
}

type ProgressListener = (root: string, progress: IndexProgress) => void;
type ChangeListener = (change: { path: string; type: 'change' | 'add' | 'unlink' }) => void;

const WASM_BY_LANGUAGE: Partial<Record<Language, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  jsx: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
};

function wasmDirectory(): string | null {
  const candidates = [
    path.join(app.getAppPath(), 'node_modules', 'tree-sitter-wasms', 'out'),
    path.join(process.resourcesPath ?? '', 'wasm'),
    path.join(app.getAppPath(), 'resources', 'wasm'),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fsSync.existsSync(path.join(candidate, 'tree-sitter-typescript.wasm'))) {
        return candidate;
      }
    } catch {
      /* yoksay */
    }
  }
  return null;
}

let parserModulePromise: Promise<{
  Parser: { init(options?: unknown): Promise<void>; new (): TsParser };
  Language: { load(input: string): Promise<unknown> };
} | null> | null = null;

async function loadTreeSitter() {
  if (!parserModulePromise) {
    parserModulePromise = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import('web-tree-sitter');
        const Parser = mod.Parser ?? mod.default?.Parser;
        const Language = mod.Language ?? mod.default?.Language;
        if (!Parser || !Language) return null;
        await Parser.init();
        return { Parser, Language };
      } catch {
        return null;
      }
    })();
  }
  return parserModulePromise;
}

/* ------------------------------------------------------------------ */
/* Sembol çıkarımı                                                     */
/* ------------------------------------------------------------------ */

const TS_SYMBOL_NODES: Record<string, SymbolKind> = {
  function_declaration: 'function',
  generator_function_declaration: 'function',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  method_definition: 'method',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
};

interface ExtractionResult {
  symbols: IndexedSymbol[];
  imports: string[];
  identifiers: IdentifierRef[];
}

const IDENTIFIER_TYPES = new Set([
  'identifier',
  'type_identifier',
  'property_identifier',
  'shorthand_property_identifier',
  'shorthand_property_identifier_pattern',
]);

function stripQuotes(value: string): string {
  return value.replace(/^['"`]|['"`]$/g, '');
}

function makeSymbol(
  filePath: string,
  name: string,
  kind: SymbolKind,
  node: TsNode,
  container: string | undefined,
  exported: boolean,
): IndexedSymbol {
  const line = node.startPosition.row + 1;
  return {
    id: `${filePath}:${line}:${name}:${kind}`,
    name,
    kind,
    file: filePath,
    line,
    column: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    container,
    exported,
  };
}

function extractTypeScript(filePath: string, root: TsNode): ExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const imports: string[] = [];
  const identifiers: IdentifierRef[] = [];

  const visit = (node: TsNode, container?: string, exported = false) => {
    const type = node.type;
    if (IDENTIFIER_TYPES.has(type)) {
      identifiers.push({
        name: node.text,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
      });
    }

    let nextContainer = container;
    const isExported = exported || type === 'export_statement';

    if (TS_SYMBOL_NODES[type]) {
      const nameNode = node.childForFieldName('name');
      if (nameNode && nameNode.text) {
        symbols.push(
          makeSymbol(filePath, nameNode.text, TS_SYMBOL_NODES[type], node, container, isExported),
        );
        if (type === 'class_declaration' || type === 'abstract_class_declaration') {
          nextContainer = nameNode.text;
        }
      }
    }

    if (type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      if (nameNode && nameNode.type === 'identifier') {
        const isFunction =
          valueNode?.type === 'arrow_function' || valueNode?.type === 'function_expression';
        symbols.push(
          makeSymbol(
            filePath,
            nameNode.text,
            isFunction ? 'function' : 'variable',
            node,
            container,
            isExported,
          ),
        );
      }
    }

    if (type === 'import_statement') {
      const source = node.childForFieldName('source')?.text ?? '';
      if (source) imports.push(stripQuotes(source));
    }
    if (type === 'export_statement') {
      const source = node.childForFieldName('source')?.text;
      if (source) imports.push(stripQuotes(source));
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, nextContainer, isExported);
    }
  };

  visit(root);
  return { symbols, imports, identifiers };
}

function extractPython(filePath: string, root: TsNode): ExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const imports: string[] = [];
  const identifiers: IdentifierRef[] = [];

  const visit = (node: TsNode, container?: string) => {
    if (node.type === 'identifier') {
      identifiers.push({
        name: node.text,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
      });
    }

    let nextContainer = container;
    if (node.type === 'function_definition' || node.type === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const kind: SymbolKind =
          node.type === 'class_definition' ? 'class' : container ? 'method' : 'function';
        symbols.push(makeSymbol(filePath, nameNode.text, kind, node, container, !nameNode.text.startsWith('_')));
        if (kind === 'class') nextContainer = nameNode.text;
      }
    }

    if (node.type === 'assignment') {
      const left = node.childForFieldName('left');
      if (left && left.type === 'identifier') {
        symbols.push(
          makeSymbol(filePath, left.text, 'variable', node, container, !left.text.startsWith('_')),
        );
      }
    }

    if (node.type === 'import_statement') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) imports.push(child.text);
      }
    }
    if (node.type === 'import_from_statement') {
      const moduleNode = node.childForFieldName('module_name');
      if (moduleNode) imports.push(moduleNode.text);
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child, nextContainer);
    }
  };

  visit(root);
  return { symbols, imports, identifiers };
}

/** Tree-sitter kullanılamadığında: dürüst, sınırlı ama çalışan bir yedek. */
function extractHeuristic(filePath: string, text: string, language: Language): ExtractionResult {
  const symbols: IndexedSymbol[] = [];
  const imports: string[] = [];
  const identifiers: IdentifierRef[] = [];
  const lines = text.split(/\r?\n/);

  const patterns: Array<{ re: RegExp; kind: SymbolKind; group?: number }> =
    language === 'python'
      ? [
          { re: /^\s*class\s+([A-Za-z_][\w]*)/, kind: 'class' },
          { re: /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)/, kind: 'function' },
          { re: /^([A-Za-z_][\w]*)\s*=/, kind: 'variable' },
        ]
      : [
          { re: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'function' },
          { re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: 'function' },
          { re: /^\s*export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
          { re: /^\s*class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
          { re: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)/, kind: 'interface' },
          { re: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)/, kind: 'type' },
          { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, kind: 'variable' },
        ];

  lines.forEach((line, index) => {
    for (const { re, kind } of patterns) {
      const match = re.exec(line);
      if (match?.[1]) {
        const name = match[1];
        const column = line.indexOf(name) + 1;
        symbols.push({
          id: `${filePath}:${index + 1}:${name}:${kind}`,
          name,
          kind,
          file: filePath,
          line: index + 1,
          column,
          endLine: index + 1,
          container: undefined,
          exported: /^\s*export/.test(line) || language === 'python',
        });
        break;
      }
    }
    const importMatch =
      language === 'python'
        ? /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/.exec(line)
        : /^\s*import\s+.+?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/.exec(line);
    if (importMatch) imports.push(importMatch[1] ?? importMatch[2] ?? '');

    const identifierRe = /[A-Za-z_$][\w$]*/g;
    let ident: RegExpExecArray | null;
    while ((ident = identifierRe.exec(line))) {
      identifiers.push({ name: ident[0], line: index + 1, column: ident.index + 1 });
    }
  });

  return { symbols, imports, identifiers };
}

/* ------------------------------------------------------------------ */
/* İndeks                                                              */
/* ------------------------------------------------------------------ */

export class ProjectIndex {
  private root = '';
  private parsed = new Map<string, ParsedFile>();
  private progress: IndexProgress = { state: 'idle', scanned: 0, total: 0 };
  private skipped = 0;
  private skippedReasons: Record<string, number> = {};
  private parserKind: 'tree-sitter' | 'heuristic' = 'heuristic';
  private parserNote = 'Henüz indekslenmedi.';
  private watcher: fsSync.FSWatcher | null = null;
  private watcherActive = false;
  private scanToken = 0;
  private languages = new Map<Language, TsParser>();
  private wasmDir: string | null = null;
  private tsModule: Awaited<ReturnType<typeof loadTreeSitter>> = null;
  private pendingWrites = new Map<string, NodeJS.Timeout>();
  private progressListener: ProgressListener | null = null;
  private changeListener: ChangeListener | null = null;
  private lspStatus: LspStatus = {
    available: false,
    running: false,
    message: 'LSP sunucusu aranmadı.',
  };

  setListeners(listener: ProgressListener, change: ChangeListener): void {
    this.progressListener = listener;
    this.changeListener = change;
  }

  setLspStatus(status: LspStatus): void {
    this.lspStatus = status;
  }

  getStatus(): IndexProgress {
    return this.progress;
  }

  getRoot(): string {
    return this.root;
  }

  private emitProgress(patch: Partial<IndexProgress>): void {
    this.progress = { ...this.progress, ...patch };
    if (this.root && this.progressListener) {
      this.progressListener(this.root, this.progress);
    }
  }

  /* ---------------------------- tarama ---------------------------- */

  private async initializeParsers(languages: Set<Language>): Promise<void> {
    this.wasmDir = this.wasmDir ?? wasmDirectory();
    this.tsModule = await loadTreeSitter();
    if (!this.tsModule || !this.wasmDir) {
      this.parserKind = 'heuristic';
      this.parserNote = !this.tsModule
        ? 'Tree-sitter yüklenemedi; sadeleştirilmiş (regex) çıkarım kullanılıyor.'
        : 'Dil gramerleri (tree-sitter-wasms) bulunamadı; sadeleştirilmiş çıkarım kullanılıyor.';
      return;
    }
    let loaded = 0;
    let failed = 0;
    for (const language of languages) {
      if (this.languages.has(language)) {
        loaded++;
        continue;
      }
      const wasmFile = WASM_BY_LANGUAGE[language];
      if (!wasmFile) continue;
      try {
        const languageGrammar = await this.tsModule.Language.load(path.join(this.wasmDir, wasmFile));
        const parser = new this.tsModule.Parser();
        parser.setLanguage(languageGrammar);
        this.languages.set(language, parser);
        loaded++;
      } catch {
        failed++;
      }
    }
    this.parserKind = loaded > 0 ? 'tree-sitter' : 'heuristic';
    this.parserNote =
      failed > 0
        ? `Tree-sitter (WASM): ${loaded} dil yüklendi, ${failed} dil yüklenemedi.`
        : `Tree-sitter (WASM): ${loaded} dil etkin.`;
  }

  private async collectFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    this.skipped = 0;
    this.skippedReasons = {};

    const skip = (reason: string) => {
      this.skipped += 1;
      this.skippedReasons[reason] = (this.skippedReasons[reason] ?? 0) + 1;
    };

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (found.length >= MAX_FILES || depth > 12) return;
      let dirents: import('node:fs').Dirent[];
      try {
        dirents = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const dirent of dirents) {
        if (found.length >= MAX_FILES) return;
        if (dirent.name.startsWith('.')) {
          if (dirent.isDirectory()) continue;
          skip('gizli dosya');
          continue;
        }
        const full = path.join(dir, dirent.name);
        if (dirent.isSymbolicLink()) {
          skip('sembolik bağ');
          continue;
        }
        if (dirent.isDirectory()) {
          if (IGNORED_DIRECTORIES.has(dirent.name)) {
            skip('yok sayılan klasör');
            continue;
          }
          await walk(full, depth + 1);
          continue;
        }
        if (!dirent.isFile()) continue;
        if (isSecretFile(full)) {
          skip('gizli/anahtar dosyası');
          continue;
        }
        if (isBinaryPath(full)) {
          skip('ikili dosya');
          continue;
        }
        if (!isIndexablePath(full)) {
          skip('desteklenmeyen tür');
          continue;
        }
        try {
          const stat = await fs.stat(full);
          if (stat.size > MAX_FILE_BYTES) {
            skip('çok büyük (>512 KB)');
            continue;
          }
        } catch {
          skip('okunamadı');
          continue;
        }
        found.push(full);
      }
    };

    await walk(root, 0);
    return found;
  }

  async scan(root: string): Promise<IndexSnapshot> {
    const token = ++this.scanToken;
    this.root = root;
    const startedAt = Date.now();
    this.progress = { state: 'scanning', scanned: 0, total: 0, startedAt };
    this.emitProgress({});

    const files = await this.collectFiles(root);
    if (token !== this.scanToken) return this.snapshot();

    const languages = new Set<Language>();
    for (const file of files) languages.add(languageOf(file));
    await this.initializeParsers(languages);

    this.parsed.clear();
    this.emitProgress({ total: files.length, message: 'Semboller çıkarılıyor…' });

    let lastEmit = 0;
    for (let index = 0; index < files.length; index++) {
      if (token !== this.scanToken) return this.snapshot();
      const file = files[index];
      const parsed = await this.parseFile(file);
      if (parsed) this.parsed.set(file, parsed);
      if (Date.now() - lastEmit > 120 || index === files.length - 1) {
        this.emitProgress({ scanned: index + 1, total: files.length });
        lastEmit = Date.now();
      }
    }

    this.emitProgress({
      state: 'ready',
      scanned: files.length,
      total: files.length,
      message:
        files.length === 0
          ? 'Desteklenen kaynak dosya bulunamadı (TypeScript/JavaScript/Python).'
          : `${files.length} dosya indekslendi.`,
      finishedAt: Date.now(),
    });

    this.startWatcher(root);
    return this.snapshot();
  }

  private async parseFile(filePath: string): Promise<ParsedFile | null> {
    let text: string;
    try {
      const buffer = await fs.readFile(filePath);
      if (buffer.subarray(0, 4096).includes(0)) return null;
      text = buffer.toString('utf8');
    } catch {
      return null;
    }
    const language = languageOf(filePath);
    let result: ExtractionResult;
    let parseError: string | undefined;
    const parser = this.languages.get(language);

    if (parser && this.parserKind === 'tree-sitter') {
      try {
        const tree = parser.parse(text);
        result =
          language === 'python'
            ? extractPython(filePath, tree.rootNode)
            : extractTypeScript(filePath, tree.rootNode);
        if (tree.rootNode.namedChildCount > 0) {
          for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
            if (tree.rootNode.namedChild(i)?.type === 'ERROR') {
              parseError = 'Sözdizimi hatası (kısmi indeks).';
              break;
            }
          }
        }
        tree.delete();
      } catch {
        result = extractHeuristic(filePath, text, language);
        parseError = 'Tree-sitter ayrıştırması başarısız; yedek çıkarım kullanıldı.';
      }
    } else {
      result = extractHeuristic(filePath, text, language);
    }

    return {
      path: filePath,
      language,
      size: Buffer.byteLength(text, 'utf8'),
      lines: text.split('\n').length,
      symbols: result.symbols,
      imports: result.imports.filter(Boolean),
      identifiers: result.identifiers,
      parseError,
      updatedAt: Date.now(),
    };
  }

  private async reindexFile(filePath: string): Promise<void> {
    if (isSecretFile(filePath) || isBinaryPath(filePath) || !isIndexablePath(filePath)) return;
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_BYTES) {
        this.parsed.delete(filePath);
        return;
      }
    } catch {
      this.parsed.delete(filePath);
      return;
    }
    if (this.parserKind === 'heuristic' && this.languages.size === 0) {
      await this.initializeParsers(new Set([languageOf(filePath)]));
    }
    const parsed = await this.parseFile(filePath);
    if (parsed) this.parsed.set(filePath, parsed);
    if (this.progress.state === 'ready') {
      this.emitProgress({
        message: `${path.basename(filePath)} güncellendi.`,
        finishedAt: Date.now(),
      });
    }
  }

  /* --------------------------- izleyici --------------------------- */

  private startWatcher(root: string): void {
    if (this.watcher) return;
    try {
      this.watcher = fsSync.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const relative = String(filename);
        const parts = relative.split(/[\\/]/);
        if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return;
        const full = path.join(root, relative);
        if (isSecretFile(full) || isBinaryPath(full) || !isIndexablePath(full)) return;
        const existing = this.pendingWrites.get(full);
        if (existing) clearTimeout(existing);
        this.pendingWrites.set(
          full,
          setTimeout(() => {
            this.pendingWrites.delete(full);
            const exists = fsSync.existsSync(full);
            if (!exists) {
              this.parsed.delete(full);
              this.changeListener?.({ path: full, type: 'unlink' });
              return;
            }
            const known = this.parsed.has(full);
            void this.reindexFile(full).then(() => {
              this.changeListener?.({ path: full, type: known ? 'change' : 'add' });
            });
          }, 250),
        );
      });
      this.watcherActive = true;
    } catch {
      this.watcherActive = false;
    }
  }

  stopWatcher(): void {
    this.watcher?.close();
    this.watcher = null;
    this.watcherActive = false;
  }

  notifySaved(filePath: string): void {
    void this.reindexFile(filePath);
  }

  /* ----------------------------- sorgu ----------------------------- */

  private allSymbols(): IndexedSymbol[] {
    const symbols: IndexedSymbol[] = [];
    for (const file of this.parsed.values()) symbols.push(...file.symbols);
    return symbols;
  }

  snapshot(): IndexSnapshot {
    const files: IndexedFile[] = [];
    for (const file of this.parsed.values()) {
      files.push({
        path: file.path,
        language: file.language,
        size: file.size,
        lines: file.lines,
        symbolCount: file.symbols.length,
        importCount: file.imports.length,
        updatedAt: file.updatedAt,
        parseError: file.parseError,
      });
    }
    files.sort((a, b) => a.path.localeCompare(b.path, 'tr'));
    const symbols = this.allSymbols()
      .sort((a, b) => a.file.localeCompare(b.file, 'tr') || a.line - b.line)
      .slice(0, MAX_SYMBOLS_IN_SNAPSHOT);

    return {
      root: this.root,
      status: this.progress,
      files,
      symbols,
      skippedFiles: this.skipped,
      skippedReasons: this.skippedReasons,
      parser: this.parserKind,
      parserNote: this.parserNote,
      watcherActive: this.watcherActive,
      lsp: this.lspStatus,
    };
  }

  relations(symbolId: string): SymbolRelations {
    const definition = this.allSymbols().find((symbol) => symbol.id === symbolId) ?? null;
    if (!definition) return { symbolId, definition: null, references: [] };
    const references: SymbolReference[] = [];
    for (const file of this.parsed.values()) {
      for (const identifier of file.identifiers) {
        if (identifier.name !== definition.name) continue;
        if (file.path === definition.file && identifier.line === definition.line) continue;
        references.push({ file: file.path, line: identifier.line, column: identifier.column });
        if (references.length >= MAX_REFERENCES) {
          return { symbolId, definition, references };
        }
      }
    }
    return { symbolId, definition, references };
  }

  async buildContext(request: ContextRequest): Promise<ContextBundle> {
    const budget = request.maxTokens ?? 6000;
    const items: ContextItem[] = [];
    let used = 0;
    let omitted = 0;

    const push = (item: ContextItem) => {
      if (used + item.tokens > budget) {
        omitted += 1;
        return;
      }
      items.push(item);
      used += item.tokens;
    };

    const readSlice = async (
      filePath: string,
      startLine?: number,
      endLine?: number,
      maxLines = 400,
    ) => {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const lines = raw.split('\n');
        const start = Math.max(0, (startLine ?? 1) - 1);
        const hardEnd = Math.min(lines.length, endLine ?? lines.length);
        const end = Math.min(hardEnd, start + maxLines);
        return {
          text: lines.slice(start, end).join('\n'),
          startLine: start + 1,
          endLine: end,
          truncated: end < hardEnd,
        };
      } catch {
        return null;
      }
    };

    if (request.selection && request.selection.text.trim()) {
      const selection = request.selection;
      const text = selection.text.split('\n').slice(0, 400).join('\n');
      push({
        id: `selection:${selection.path}:${selection.startLine}`,
        kind: 'selection',
        path: selection.path,
        label: `${path.basename(selection.path)}:${selection.startLine}-${selection.endLine}`,
        reason: 'Editörde seçilen kod',
        startLine: selection.startLine,
        endLine: selection.endLine,
        content: text,
        tokens: estimateTokens(text),
        truncated: selection.text.split('\n').length > 400,
      });
    }

    const symbolIds = request.symbolIds ?? [];
    if (symbolIds.length > 0) {
      const symbols = this.allSymbols();
      const seenFiles = new Set<string>();
      for (const id of symbolIds) {
        const symbol = symbols.find((candidate) => candidate.id === id);
        if (!symbol) continue;
        const slice = await readSlice(symbol.file, symbol.line, symbol.endLine, 200);
        if (!slice) continue;
        seenFiles.add(symbol.file);
        push({
          id: `symbol:${symbol.id}`,
          kind: 'symbol',
          path: symbol.file,
          label: `${symbol.name} (${symbol.kind})`,
          reason: `Tanım: ${path.basename(symbol.file)}:${symbol.line}`,
          startLine: slice.startLine,
          endLine: slice.endLine,
          content: slice.text,
          tokens: estimateTokens(slice.text),
          truncated: slice.truncated,
        });
      }
    }

    for (const filePath of request.paths ?? []) {
      const slice = await readSlice(filePath);
      if (!slice) continue;
      push({
        id: `file:${filePath}`,
        kind: 'file',
        path: filePath,
        label: path.basename(filePath),
        reason: 'Kullanıcı bu dosyayı bağlama ekledi',
        startLine: 1,
        endLine: slice.endLine,
        content: slice.text,
        tokens: estimateTokens(slice.text),
        truncated: slice.truncated,
      });
    }

    return { items, totalTokens: used, budget, omitted };
  }
}

export const projectIndex = new ProjectIndex();

import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker';
import type { Language } from '@shared/types';

declare global {
  interface Window {
    MonacoEnvironment?: unknown;
  }
}

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

let themeDefined = false;

function defineTheme(): void {
  if (themeDefined) return;
  themeDefined = true;
  monaco.editor.defineTheme('adiutor-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '66707f', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9db4ff' },
      { token: 'string', foreground: 'a8d08d' },
      { token: 'number', foreground: 'e2b86b' },
      { token: 'type', foreground: '7fd3c8' },
      { token: 'function', foreground: 'cbb6ff' },
      { token: 'variable', foreground: 'd6dae2' },
      { token: 'tag', foreground: '8fb8ff' },
    ],
    colors: {
      'editor.background': '#0b0d11',
      'editor.foreground': '#d7dce5',
      'editorLineNumber.foreground': '#414b5a',
      'editorLineNumber.activeForeground': '#8a94a5',
      'editor.lineHighlightBackground': '#12161d',
      'editor.selectionBackground': '#2b3f63',
      'editor.inactiveSelectionBackground': '#1e2a3d',
      'editorCursor.foreground': '#8bb0ff',
      'editorIndentGuide.background1': '#1d232c',
      'editorIndentGuide.activeBackground1': '#313a47',
      'editorGutter.background': '#0b0d11',
      'editorWidget.background': '#13171d',
      'editorWidget.border': '#2a323d',
      'editorSuggestWidget.background': '#13171d',
      'editorSuggestWidget.selectedBackground': '#1e2632',
      'scrollbarSlider.background': '#2a323d80',
      'scrollbarSlider.hoverBackground': '#3a4452aa',
      'editorBracketMatch.background': '#1f2a3a',
      'editorBracketMatch.border': '#3c5375',
    },
  });
}

const LANGUAGE_IDS: Record<Language, string> = {
  typescript: 'typescript',
  tsx: 'typescript',
  javascript: 'javascript',
  jsx: 'javascript',
  python: 'python',
  other: 'plaintext',
};

const models = new Map<string, monaco.editor.ITextModel>();
let configured = false;

function configureLanguages(): void {
  if (configured) return;
  configured = true;
  monaco.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.typescript.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    strict: false,
    noEmit: true,
    esModuleInterop: true,
  });
  monaco.typescript.javascriptDefaults.setEagerModelSync(true);
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
}

function modelFor(path: string, language: Language, content: string): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(`adiutor://workspace/${encodeURIComponent(path)}`);
  const existing = models.get(path) ?? monaco.editor.getModel(uri);
  if (existing) {
    models.set(path, existing);
    return existing;
  }
  const model = monaco.editor.createModel(content, LANGUAGE_IDS[language], uri);
  models.set(path, model);
  return model;
}

export interface MonacoEditorProps {
  path: string;
  language: Language;
  content: string;
  onChange(content: string): void;
  onSelection(selection: { path: string; startLine: number; endLine: number; text: string } | null): void;
  revealLine?: number | null;
  onRevealDone?(): void;
}

export function MonacoEditor({
  path,
  language,
  content,
  onChange,
  onSelection,
  revealLine,
  onRevealDone,
}: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suppressChange = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSelectionRef = useRef(onSelection);
  const pathRef = useRef(path);
  onChangeRef.current = onChange;
  onSelectionRef.current = onSelection;
  pathRef.current = path;

  useEffect(() => {
    defineTheme();
    configureLanguages();
    if (!hostRef.current) return;

    const editor = monaco.editor.create(hostRef.current, {
      model: null,
      theme: 'adiutor-dark',
      automaticLayout: true,
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      fontLigatures: false,
      minimap: { enabled: false },
      padding: { top: 10, bottom: 20 },
      scrollBeyondLastLine: false,
      smoothScrolling: false,
      cursorBlinking: 'smooth',
      renderLineHighlight: 'line',
      renderWhitespace: 'selection',
      tabSize: 2,
      wordWrap: 'off',
      glyphMargin: false,
      folding: true,
      fixedOverflowWidgets: true,
      guides: { bracketPairs: true, indentation: true },
      bracketPairColorization: { enabled: true },
      overviewRulerLanes: 0,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      suggest: { showWords: true },
      accessibilitySupport: 'auto',
    });
    editorRef.current = editor;

    const contentSub = editor.onDidChangeModelContent(() => {
      if (suppressChange.current) return;
      const model = editor.getModel();
      if (model) onChangeRef.current(model.getValue());
    });

    const selectionSub = editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel();
      if (!model) return;
      if (event.selection.isEmpty()) {
        onSelectionRef.current(null);
        return;
      }
      const text = model.getValueInRange(event.selection);
      if (!text.trim()) {
        onSelectionRef.current(null);
        return;
      }
      onSelectionRef.current({
        path: pathRef.current,
        startLine: event.selection.startLineNumber,
        endLine: event.selection.endLineNumber,
        text,
      });
    });

    return () => {
      contentSub.dispose();
      selectionSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // Editör yalnızca bir kez oluşturulur; model değişimi ayrı efekt ile yapılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = modelFor(path, language, content);
    if (editor.getModel() !== model) {
      suppressChange.current = true;
      editor.setModel(model);
      if (model.getValue() !== content) model.setValue(content);
      suppressChange.current = false;
    }
    onSelectionRef.current(null);
  }, [path, language, content]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model && model.getValue() !== content) {
      const position = editor.getPosition();
      suppressChange.current = true;
      model.setValue(content);
      suppressChange.current = false;
      if (position) editor.setPosition(position);
    }
  }, [content]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine) return;
    editor.revealLineInCenter(revealLine, monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber: revealLine, column: 1 });
    editor.focus();
    onRevealDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealLine, path]);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} data-testid="monaco-host" />;
}

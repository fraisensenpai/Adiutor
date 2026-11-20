import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { bridge } from '@/lib/bridge';
import { formatTime, truncate } from '@/lib/format';
import { ChevronDown, ChevronUp, RefreshIcon, TerminalIcon, XIcon } from './ui/Icons';
import { IconButton } from './ui/primitives';

const ANSI = /\u001b\[[0-9;?]*[a-zA-Z]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI, '');
}

function TerminalView({ active }: { active: boolean }) {
  const workspace = useStore((state) => state.workspace);
  const [output, setOutput] = useState('');
  const [input, setInput] = useState('');
  const [shell, setShell] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const append = (data: string) => {
    setOutput((current) => {
      const next = current + stripAnsi(data);
      return next.length > 200_000 ? next.slice(-200_000) : next;
    });
  };

  const start = async () => {
    if (!workspace) return;
    setStarting(true);
    setError('');
    try {
      const result = await bridge.terminal.start(workspace.root);
      sessionRef.current = result.sessionId;
      setShell(result.shell);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Terminal başlatılamadı.');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    const offData = bridge.events.onTerminalData((payload) => {
      if (payload.sessionId !== sessionRef.current) return;
      append(payload.data);
    });
    const offExit = bridge.events.onTerminalExit((payload) => {
      if (payload.sessionId !== sessionRef.current) return;
      append(`\r\n[oturum kapandı — çıkış kodu ${payload.code ?? 'yok'}]\r\n`);
      sessionRef.current = null;
    });
    return () => {
      offData();
      offExit();
    };
  }, []);

  useEffect(() => {
    void start();
    return () => {
      if (sessionRef.current) {
        void bridge.terminal.kill(sessionRef.current);
        sessionRef.current = null;
      }
    };
    // Çalışma alanı değiştiğinde yeni oturum açılır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.root]);

  useEffect(() => {
    if (!active) return;
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [output, active]);

  const submit = () => {
    const command = input;
    if (!sessionRef.current) return;
    append(`\r\n${shell.includes('powershell') ? 'PS' : '$'} ${command}\r\n`);
    void bridge.terminal.write(sessionRef.current, `${command}\r\n`);
    setInput('');
  };

  return (
    <div className="terminal">
      <div className="terminal-output" ref={outputRef} aria-label="Terminal çıktısı" role="log">
        {output || 'Terminal hazır. Komutlar yerel olarak, seçili proje klasöründe çalışır.\r\n'}
        {error ? `\r\n[terminal hatası] ${error}` : ''}
      </div>
      <div className="terminal-input-row">
        <span className="terminal-prompt" aria-hidden="true">
          ❯
        </span>
        <input
          ref={inputRef}
          className="terminal-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={workspace ? 'Komut yazın ve Enter’a basın (PTY yok)' : 'Önce bir proje açın'}
          aria-label="Terminal komutu"
          disabled={!sessionRef.current}
          spellCheck={false}
        />
        <span className="dim" style={{ fontSize: 10 }}>
          {starting ? 'başlatılıyor…' : shell ? shell.split(/[\\/]/).pop() : 'oturum yok'}
        </span>
        <IconButton
          label="Yeni terminal oturumu"
          onClick={() => {
            if (sessionRef.current) void bridge.terminal.kill(sessionRef.current);
            sessionRef.current = null;
            setOutput('');
            void start();
          }}
        >
          <RefreshIcon size={13} />
        </IconButton>
        <IconButton
          label="Çıktıyı temizle"
          onClick={() => {
            setOutput('');
            if (sessionRef.current) void bridge.terminal.write(sessionRef.current, '\f');
          }}
        >
          <XIcon size={13} />
        </IconButton>
      </div>
    </div>
  );
}

function LogView() {
  const log = useStore((state) => state.log);
  if (log.length === 0) {
    return (
      <div className="dim" style={{ fontSize: 11.5, padding: '4px 0' }}>
        Henüz görev günlüğü yok. Bir görev başlattığınızda ajan adımları burada listelenir.
      </div>
    );
  }
  return (
    <div className="log-list" role="log" aria-label="Görev günlüğü">
      {log.map((entry) => (
        <div key={entry.id} className={`log-item log-${entry.level}`}>
          <span className="log-time">{formatTime(entry.at)}</span>
          <span className="log-agent">{entry.agent ?? 'sistem'}</span>
          <span className="log-message">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}

function ProblemsView() {
  const problems = useStore((state) => state.problems);
  const message = useStore((state) => state.problemsMessage);
  const loading = useStore((state) => state.problemsLoading);
  const refresh = useStore((state) => state.refreshProblems);
  const activePath = useStore((state) => state.activePath);

  return (
    <div>
      <div className="row" style={{ marginBottom: 6, fontSize: 11.5 }}>
        <span className="dim grow">{message}</span>
        <button type="button" className="button button-ghost button-small" onClick={() => void refresh()} disabled={!activePath || loading}>
          {loading ? 'Sorgulanıyor…' : 'Tanılamaları yenile'}
        </button>
      </div>
      {problems.length === 0 ? (
        <div className="dim" style={{ fontSize: 11.5 }}>
          Tanılama yok. LSP, yalnızca `typescript-language-server` kuruluysa çalışır; aksi halde bu panel bunu açıkça bildirir.
        </div>
      ) : (
        problems.map((problem, index) => (
          <div className="problem-item" key={`${problem.line}-${index}`}>
            <span className="problem-location">
              {problem.line}:{problem.column}
            </span>
            <span className={`badge ${problem.severity === 'error' ? 'badge-danger' : 'badge-warn'}`}>
              {problem.severity}
            </span>
            <span className="grow">{truncate(problem.message, 220)}</span>
          </div>
        ))
      )}
    </div>
  );
}

export function BottomPanel() {
  const bottomOpen = useStore((state) => state.bottomOpen);
  const bottomTab = useStore((state) => state.bottomTab);
  const setBottomTab = useStore((state) => state.setBottomTab);
  const toggleBottom = useStore((state) => state.toggleBottom);
  const log = useStore((state) => state.log);
  const problems = useStore((state) => state.problems);

  return (
    <section className={`bottom-panel ${bottomOpen ? '' : 'is-collapsed'}`} aria-label="Alt panel">
      <div className="panel-header">
        <button
          type="button"
          className="panel-tab"
          aria-selected={bottomTab === 'terminal'}
          onClick={() => setBottomTab('terminal')}
        >
          <TerminalIcon size={13} />
          Terminal
        </button>
        <button
          type="button"
          className="panel-tab"
          aria-selected={bottomTab === 'log'}
          onClick={() => setBottomTab('log')}
        >
          Görev Günlüğü
          {log.length > 0 ? <span className="count">{log.length}</span> : null}
        </button>
        <button
          type="button"
          className="panel-tab"
          aria-selected={bottomTab === 'problems'}
          onClick={() => setBottomTab('problems')}
        >
          Sorunlar
          {problems.length > 0 ? <span className="count">{problems.length}</span> : null}
        </button>
        <div className="panel-header-right">
          <IconButton label={bottomOpen ? 'Paneli daralt' : 'Paneli genişlet'} onClick={toggleBottom}>
            {bottomOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </IconButton>
        </div>
      </div>
      <div className="panel-body" style={{ display: bottomOpen ? 'block' : 'none', padding: bottomTab === 'terminal' ? '6px 10px 8px' : undefined }}>
        <div style={{ display: bottomTab === 'terminal' ? 'block' : 'none', height: '100%' }}>
          <TerminalView active={bottomTab === 'terminal'} />
        </div>
        {bottomTab === 'log' ? <LogView /> : null}
        {bottomTab === 'problems' ? <ProblemsView /> : null}
      </div>
    </section>
  );
}

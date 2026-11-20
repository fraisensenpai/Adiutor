import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { CommandResult, TerminalStartResult } from '../../src/shared/types';

/**
 * Terminal servisi.
 *
 * Not: İlk sürümde PTY (node-pty) yok; süreç standart borularla çalıştırılır.
 * Bu nedenle `vim`, `top` gibi tam ekran etkileşimli programlar desteklenmez.
 * Komut çalıştırma ve çıktı akışı çalışır.
 */

interface Session {
  id: string;
  child: ChildProcessWithoutNullStreams;
  cwd: string;
  shell: string;
}

type DataListener = (payload: { sessionId: string; data: string }) => void;
type ExitListener = (payload: { sessionId: string; code: number | null }) => void;

function shellCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
    };
  }
  const shell = process.env.SHELL || '/bin/bash';
  return { command: shell, args: ['-i'] };
}

export class TerminalService {
  private sessions = new Map<string, Session>();
  private onData: DataListener;
  private onExit: ExitListener;

  constructor(onData: DataListener, onExit: ExitListener) {
    this.onData = onData;
    this.onExit = onExit;
  }

  start(cwd: string): TerminalStartResult {
    const { command, args } = shellCommand();
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
      stdio: 'pipe',
      windowsHide: true,
    });
    const sessionId = randomUUID();
    this.sessions.set(sessionId, { id: sessionId, child, cwd, shell: command });

    child.stdout.on('data', (chunk: Buffer) => {
      this.onData({ sessionId, data: chunk.toString('utf8') });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      this.onData({ sessionId, data: chunk.toString('utf8') });
    });
    child.on('exit', (code) => {
      this.sessions.delete(sessionId);
      this.onExit({ sessionId, code });
    });
    child.on('error', (error) => {
      this.onData({ sessionId, data: `\r\n[terminal hatası] ${error.message}\r\n` });
    });

    // Windows PowerShell'de Türkçe karakterler için UTF-8 çıktı.
    if (process.platform === 'win32') {
      child.stdin.write(
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n$OutputEncoding = [System.Text.Encoding]::UTF8\r\n',
      );
    }

    this.onData({
      sessionId,
      data: `\r\nAdiutor terminal — ${cwd}\r\n${command} (PTY yok; tam ekran programlar desteklenmez)\r\n\r\n`,
    });

    return { sessionId, shell: command, cwd };
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.child.stdin.write(data);
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.child.kill();
    this.sessions.delete(sessionId);
  }

  killAll(): void {
    for (const session of this.sessions.values()) session.child.kill();
    this.sessions.clear();
  }

  /** Kullanıcı onayı verdiğinde tek seferlik komut çalıştırır (çıktı yakalanır). */
  runOnce(cwd: string, command: string, timeoutMs = 120_000): Promise<CommandResult> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const child = spawn(
        isWindows ? 'powershell.exe' : process.env.SHELL || '/bin/bash',
        isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command],
        {
          cwd,
          env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0' },
          stdio: 'pipe',
          windowsHide: true,
        },
      );
      let output = '';
      const timer = setTimeout(() => {
        output += `\r\n[zaman aşımı] Komut ${Math.round(timeoutMs / 1000)} sn içinde tamamlanmadı.\r\n`;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > 200_000) output = output.slice(-200_000);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > 200_000) output = output.slice(-200_000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: -1, output: `${output}\r\n[başlatılamadı] ${error.message}`, durationMs: Date.now() - startedAt });
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output, durationMs: Date.now() - startedAt });
      });
    });
  }
}

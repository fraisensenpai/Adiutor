import type { AgentRole, AgentStatus, Language, TaskStatus } from '@shared/types';

export function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

export function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
}

const SECRET_NAME_PATTERNS = [
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
];

/** Gizli dosyalar AI bağlamına eklenmez. */
export function isSecretPath(filePath: string): boolean {
  const name = basename(filePath);
  if (name.startsWith('.')) return true;
  return SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

export function relativeTo(root: string, target: string): string {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedTarget = target.replace(/\\/g, '/');
  if (normalizedTarget.startsWith(normalizedRoot)) {
    return normalizedTarget.slice(normalizedRoot.length + 1);
  }
  return normalizedTarget;
}

/**
 * Ajanlardan gelen göreli yolu mutlak yola çevirir. Çalışma alanı dışına
 * veya `..` içeren yollara izin verilmez.
 */
export function resolveInWorkspace(root: string, target: string): string | null {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalized = target.replace(/\\/g, '/').trim();
  if (!normalized) return null;
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/')) {
    if (normalized === normalizedRoot) return null;
    if (!normalized.startsWith(`${normalizedRoot}/`)) return null;
    return normalized;
  }
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..')) return null;
  return `${normalizedRoot}/${normalized.replace(/^\/+/, '')}`;
}

export function roleLabel(role: AgentRole): string {
  return role === 'planner' ? 'Planlayıcı' : role === 'coder' ? 'Kodlayıcı' : 'İnceleyici';
}

export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'Hazır';
    case 'running':
      return 'Çalışıyor';
    case 'awaiting-approval':
      return 'Onay bekliyor';
    case 'done':
      return 'Tamamlandı';
    case 'stopped':
      return 'Durduruldu';
    case 'error':
      return 'Hata';
  }
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'idle':
      return 'Görev yok';
    case 'running':
      return 'Çalışıyor';
    case 'awaiting-approval':
      return 'Onay bekliyor';
    case 'done':
      return 'Tamamlandı';
    case 'stopped':
      return 'Durduruldu';
    case 'error':
      return 'Hata';
  }
}

export function languageLabel(language: Language): string {
  switch (language) {
    case 'typescript':
      return 'TS';
    case 'tsx':
      return 'TSX';
    case 'javascript':
      return 'JS';
    case 'jsx':
      return 'JSX';
    case 'python':
      return 'PY';
    default:
      return '—';
  }
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function truncate(value: string, max = 80): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

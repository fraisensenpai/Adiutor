import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertIcon, InfoIcon, CheckIcon, XIcon } from './Icons';
import { useStore } from '@/state/store';

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'demo' | 'live';
  title?: string;
}) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function StatusDot({ status }: { status: 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'stopped' }) {
  return <span className={`status-dot status-dot-${status}`} aria-hidden="true" />;
}

export function EmptyState({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="section-title">
      <span>{children}</span>
      {hint ? <span className="section-hint">{hint}</span> : null}
    </div>
  );
}

export function Toast() {
  const toast = useStore((state) => state.toast);
  const dismiss = useStore((state) => state.dismissToast);
  if (!toast) return null;
  const Icon = toast.tone === 'error' || toast.tone === 'warn' ? AlertIcon : toast.tone === 'success' ? CheckIcon : InfoIcon;
  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <Icon size={16} />
      <span>{toast.message}</span>
      <button type="button" className="toast-close" onClick={dismiss} aria-label="Bildirimi kapat">
        <XIcon size={14} />
      </button>
    </div>
  );
}

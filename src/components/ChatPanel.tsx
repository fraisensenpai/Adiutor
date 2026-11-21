import { useEffect, useRef } from 'react';
import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import { Markdown } from './ui/Markdown';
import { ModelPicker } from './ui/ModelPicker';
import { Badge, IconButton, StatusDot } from './ui/primitives';
import { AlertIcon, PlayIcon, SendIcon, StopIcon, TrashIcon, XIcon } from './ui/Icons';
import { ApprovalList } from './ApprovalList';
import { formatTime, roleLabel, taskStatusLabel } from '@/lib/format';
import type { ChatMessage } from '@shared/types';

function MessageMeta({ message }: { message: ChatMessage }) {
  const agents = useStore((state) => state.agents);
  const label =
    message.role === 'user'
      ? 'Siz'
      : message.role === 'system'
        ? 'Sistem'
        : message.agentRole
          ? agents[message.agentRole]?.name ?? roleLabel(message.agentRole)
          : 'Asistan';

  return (
    <div className="msg-meta">
      <span className="agent-name">{label}</span>
      <span>{formatTime(message.createdAt)}</span>
      {message.model ? <span className="dim">{message.model}</span> : null}
      {message.contextTokens ? <span>~{formatTokens(message.contextTokens)} token</span> : null}
    </div>
  );
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chat = useStore((state) => state.chat);
  const chatInput = useStore((state) => state.chatInput);
  const setChatInput = useStore((state) => state.setChatInput);
  const chatBusy = useStore((state) => state.chatBusy);
  const sendChat = useStore((state) => state.sendChat);
  const startTask = useStore((state) => state.startTask);
  const stopTask = useStore((state) => state.stopTask);
  const workspace = useStore((state) => state.workspace);
  const settings = useStore((state) => state.settings);
  const providerStatus = useStore((state) => state.providerStatus);
  const contextItems = useStore((state) => state.contextItems);
  const removeContext = useStore((state) => state.removeContext);
  const clearContext = useStore((state) => state.clearContext);
  const setContextPreviewOpen = useStore((state) => state.setContextPreviewOpen);
  const task = useStore((state) => state.task);
  const agents = useStore((state) => state.agents);
  const changes = useStore((state) => state.changes);
  const approvals = useStore((state) => state.approvals);
  const openReview = useStore((state) => state.openReview);
  const setView = useStore((state) => state.setView);
  const clearChat = useStore((state) => state.clearChat);
  const saveSettings = useStore((state) => state.saveSettings);

  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat.length, chatBusy, approvals.length]);

  const contextTokens = contextItems.reduce((sum, item) => sum + item.tokens, 0);
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const running = task.status === 'running' || task.status === 'awaiting-approval';
  const provider = providerStatus?.providers.find((item) => item.id === settings.provider);
  const missingKey = providerStatus && provider?.requiresApiKey
    ? providerStatus.apiKeys[settings.provider] !== true
    : false;

  const submitTask = () => {
    const title = chatInput.trim();
    if (!title) return;
    setChatInput('');
    void startTask(title);
  };

  if (!open) return null;

  return (
    <aside className="chat-panel" aria-label="AI sohbeti">
      <div className="chat-header">
        <div className="grow">
          <div className="chat-title">Sohbet</div>
          <div className="chat-model-line">
            <span className="chat-subtitle">{provider?.label ?? 'Sağlayıcı'}</span>
            <ModelPicker
              models={provider?.models ?? []}
              value={settings.model}
              providerLabel={provider?.label}
              ariaLabel="Sohbet modeli"
              compact
              align="right"
              onChange={(model) => void saveSettings({ model })}
            />
          </div>
        </div>
        {pendingChanges > 0 ? (
          <button type="button" className="button button-small" onClick={openReview}>
            Diff <Badge tone="accent">{pendingChanges}</Badge>
          </button>
        ) : null}
        <IconButton
          label="Sohbet geçmişini temizle"
          onClick={() => {
            if (window.confirm('Sohbet geçmişi kalıcı olarak silinsin mi?')) void clearChat();
          }}
        >
          <TrashIcon size={14} />
        </IconButton>
        <IconButton label="Sohbeti gizle" onClick={onClose}>
          <XIcon size={15} />
        </IconButton>
      </div>

      <div className="chat-context-bar">
        <button
          type="button"
          className="context-summary"
          onClick={() => setContextPreviewOpen(true)}
          aria-label="AI'a gönderilecek bağlamı görüntüle"
        >
          <StatusDot status={contextItems.length > 0 ? 'done' : 'idle'} />
          <span>
            {contextItems.length} parça · ~{formatTokens(contextTokens)} / {formatTokens(settings.maxContextTokens)} token
          </span>
          <span style={{ marginLeft: 'auto' }}>bağlamı görüntüle</span>
        </button>
        {contextItems.length > 0 ? (
          <div className="context-chips">
            {contextItems.map((item) => (
              <span className="chip" key={item.id} title={`${item.path} — ${item.reason}`}>
                <span className="chip-label">{item.label}</span>
                <button type="button" onClick={() => removeContext(item.id)} aria-label={`${item.label} bağlamdan çıkar`}>
                  <XIcon size={10} />
                </button>
              </span>
            ))}
            <button type="button" className="link-button" style={{ fontSize: 10.5 }} onClick={clearContext}>
              tümünü temizle
            </button>
          </div>
        ) : null}
      </div>

      <div className="chat-messages" ref={messagesRef} role="log" aria-live="polite">
        {chat.map((message) => (
          <div
            key={message.id}
            className={`msg ${message.role === 'user' ? 'msg-user' : message.role === 'system' ? 'msg-system' : ''} ${
              message.error ? 'msg-error' : ''
            }`}
          >
            <MessageMeta message={message} />
            <Markdown content={message.content} />
          </div>
        ))}

        {chatBusy ? (
          <div className="msg">
            <div className="msg-meta">
              <span className="agent-name">Asistan</span>
            </div>
            <span className="msg-pending">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              yanıt hazırlanıyor
            </span>
          </div>
        ) : null}

        <ApprovalList compact />

        {task.id ? (
          <div className="note">
            <AlertIcon size={13} />
            <div className="grow">
              <strong>Görev: {task.title}</strong>
              <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>
                Durum: {taskStatusLabel(task.status)} · {roleLabel(agents.planner.role)} →{' '}
                {roleLabel(agents.coder.role)} → {roleLabel(agents.reviewer.role)}
                {pendingApprovals > 0 ? ` · ${pendingApprovals} onay bekliyor` : ''}
              </div>
            </div>
            <button type="button" className="button button-ghost button-small" onClick={() => setView('graph')}>
              Grafik
            </button>
          </div>
        ) : null}
      </div>

      <div className="composer">
        <div className="composer-box">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                void sendChat();
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submitTask();
              }
            }}
            placeholder={workspace ? 'Görev veya soru yazın… (Enter: sohbet, Ctrl+Enter: görev)' : 'Önce bir proje klasörü açın'}
            aria-label="AI sohbet mesajı"
            disabled={!workspace || chatBusy}
          />
        </div>
        <div className="composer-actions">
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => void sendChat()}
            disabled={!workspace || !chatInput.trim() || chatBusy}
          >
            <SendIcon size={12} />
            Gönder
          </button>
          {running ? (
            <button type="button" className="button button-danger button-small" onClick={stopTask}>
              <StopIcon size={12} />
              Durdur
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary button-small"
              onClick={submitTask}
              disabled={!workspace || !chatInput.trim()}
            >
              <PlayIcon size={11} />
              Görevi başlat
            </button>
          )}
        </div>
        {missingKey ? (
          <p className="composer-hint">
            İstek için {provider?.label ?? 'sağlayıcı'} anahtarı gerekli.{' '}
            <button type="button" className="link-button" onClick={() => setView('settings')}>
              Anahtar ekle
            </button>
          </p>
        ) : null}
      </div>
    </aside>
  );
}

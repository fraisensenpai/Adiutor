import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import { Markdown } from './ui/Markdown';
import { ModelPicker } from './ui/ModelPicker';
import { Badge, IconButton, StatusDot } from './ui/primitives';
import {
  AlertIcon,
  ChevronDown,
  HistoryIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  StopIcon,
  TrashIcon,
  WidenIcon,
  XIcon,
} from './ui/Icons';
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

function sessionStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (sameDay) return formatTime(timestamp);
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

export function ChatPanel({
  open,
  onClose,
  wide,
  onToggleWide,
}: {
  open: boolean;
  onClose: () => void;
  wide: boolean;
  onToggleWide: () => void;
}) {
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
  const chatSessions = useStore((state) => state.chatSessions);
  const activeSessionId = useStore((state) => state.activeSessionId);
  const newChatSession = useStore((state) => state.newChatSession);
  const selectChatSession = useStore((state) => state.selectChatSession);
  const deleteChatSession = useStore((state) => state.deleteChatSession);

  const [historyOpen, setHistoryOpen] = useState(false);

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
  const activeSession = chatSessions.find((session) => session.id === activeSessionId) ?? null;
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
          label={wide ? 'Sohbeti daralt' : 'Sohbeti genişlet'}
          aria-pressed={wide}
          onClick={onToggleWide}
        >
          <WidenIcon size={14} />
        </IconButton>
        <IconButton
          label="Bu sohbetin mesajlarını temizle"
          onClick={() => {
            if (window.confirm('Bu sohbetin mesajları kalıcı olarak silinsin mi?')) void clearChat();
          }}
        >
          <TrashIcon size={14} />
        </IconButton>
        <IconButton label="Sohbeti gizle" onClick={onClose}>
          <XIcon size={15} />
        </IconButton>
      </div>

      <div className="chat-session-bar">
        <button
          type="button"
          className="chat-session-toggle"
          aria-expanded={historyOpen}
          aria-controls="chat-history"
          onClick={() => setHistoryOpen((current) => !current)}
          title={activeSession ? `${activeSession.title} · ${activeSession.messageCount} mesaj` : 'Sohbetler'}
        >
          <HistoryIcon size={13} />
          <span className="chat-session-title">{activeSession?.title ?? 'Yeni sohbet'}</span>
          {chatSessions.length > 1 ? <span className="chat-session-count">{chatSessions.length}</span> : null}
          <ChevronDown size={11} />
        </button>
        <IconButton label="Yeni sohbet" onClick={() => void newChatSession()}>
          <PlusIcon size={14} />
        </IconButton>
      </div>

      {historyOpen ? (
        <div className="chat-history" id="chat-history" aria-label="Sohbet geçmişi">
          <div className="chat-history-head">
            <span>Sohbet geçmişi</span>
            <span>{chatSessions.length} sohbet</span>
          </div>
          <div className="chat-history-list" role="list">
            {chatSessions.map((session) => (
              <div
                key={session.id}
                role="listitem"
                className={`chat-history-item${session.id === activeSessionId ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  className="chat-history-open"
                  aria-current={session.id === activeSessionId ? 'true' : undefined}
                  onClick={() => {
                    void selectChatSession(session.id);
                    setHistoryOpen(false);
                  }}
                >
                  <span className="chat-history-title">{session.title}</span>
                  <span className="chat-history-meta">
                    {sessionStamp(session.updatedAt)} · {session.messageCount} mesaj
                  </span>
                </button>
                <button
                  type="button"
                  className="chat-history-delete"
                  aria-label={`${session.title} sohbetini sil`}
                  onClick={() => {
                    if (window.confirm(`“${session.title}” sohbeti silinsin mi?`)) {
                      void deleteChatSession(session.id);
                    }
                  }}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

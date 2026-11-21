import { useState } from 'react';
import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import type { AgentEdgeState, AgentNodeState, AgentRole } from '@shared/types';
import { ApprovalList } from './ApprovalList';
import { ModelPicker } from './ui/ModelPicker';
import { Badge, StatusDot } from './ui/primitives';
import { CheckIcon, FolderIcon, PlayIcon, StopIcon } from './ui/Icons';
import { formatTime, roleLabel, statusLabel, taskStatusLabel } from '@/lib/format';

const ROLES: AgentRole[] = ['planner', 'coder', 'reviewer'];

function statusToDot(status: AgentNodeState['status']): 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'stopped' {
  switch (status) {
    case 'running':
      return 'running';
    case 'awaiting-approval':
      return 'waiting';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'stopped':
      return 'stopped';
    default:
      return 'idle';
  }
}

function AgentCard({ role }: { role: AgentRole }) {
  const agent = useStore((state) => state.agents[role]);
  const providerStatus = useStore((state) => state.providerStatus);
  const settings = useStore((state) => state.settings);
  const setAgentName = useStore((state) => state.setAgentName);
  const setAgentModel = useStore((state) => state.setAgentModel);
  const setAgentRole = useStore((state) => state.setAgentRole);

  const models = providerStatus?.providers.find((provider) => provider.id === settings.provider)?.models ?? [];
  const accentClass = agent.role === 'planner' ? 'is-planner' : agent.role === 'coder' ? 'is-coder' : 'is-reviewer';
  const stepNumber = ROLES.indexOf(role) + 1;

  return (
    <article className={`agent-card ${accentClass}`} aria-label={`${agent.name} ajanı`}>
      <div className="agent-card-head">
        <span className="agent-avatar" aria-hidden="true">
          {stepNumber}
        </span>
        <div className="grow">
          <input
            className="agent-name-input"
            value={agent.name}
            onChange={(event) => setAgentName(role, event.target.value)}
            aria-label="Ajan adı"
            spellCheck={false}
          />
          <div className="agent-status-line">
            <StatusDot status={statusToDot(agent.status)} />
            {statusLabel(agent.status)}
            {agent.estimatedTokens > 0 ? <Badge tone="neutral">tahmini</Badge> : null}
          </div>
        </div>
      </div>

      <div className="agent-fields">
        <div className="agent-field">
          <label htmlFor={`role-${role}`}>Rol</label>
          <select
            id={`role-${role}`}
            className="select"
            value={agent.role}
            onChange={(event) => setAgentRole(role, event.target.value as AgentRole)}
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
          </select>
        </div>
        <div className="agent-field">
          <label htmlFor={`model-${role}`}>Model</label>
          <ModelPicker
            id={`model-${role}`}
            models={models}
            value={agent.model}
            providerLabel={providerStatus?.providers.find((item) => item.id === settings.provider)?.label}
            ariaLabel="Model"
            compact
            onChange={(model) => setAgentModel(role, model)}
          />
        </div>
      </div>

      <div className="agent-body">
        <div className="agent-message">{agent.lastMessage ?? 'Henüz çalışmadı.'}</div>
        {agent.steps.length > 0 ? (
          <div className="agent-steps">
            {agent.steps.slice(-4).map((step) => (
              <div className="agent-step" key={step.id}>
                <span
                  className={`status-dot ${
                    step.status === 'done'
                      ? 'status-dot-done'
                      : step.status === 'running'
                        ? 'status-dot-running'
                        : step.status === 'error'
                          ? 'status-dot-error'
                          : 'status-dot-idle'
                  }`}
                  aria-hidden="true"
                />
                <span className="agent-step-title">{step.title}</span>
                <span className="dim">{formatTime(step.at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="dim" style={{ fontSize: 'var(--fs-2xs)', lineHeight: 1.5 }}>
            {role === 'planner'
              ? 'Görevi alt adımlara böler, kodlama görevini onaya sunar.'
              : role === 'coder'
                ? 'İlgili dosyalarda diff önerir; dosyaya yazmaz.'
                : 'Diff’i inceler, riskleri ve eksik testleri bildirir.'}
          </div>
        )}
        <div className="agent-token-line">
          <span>{agent.tokens > 0 ? `${formatTokens(agent.tokens)} token` : 'henüz istek yok'}</span>
          <span>{role === 'planner' ? 'plan' : role === 'coder' ? 'kod' : 'inceleme'}</span>
        </div>
      </div>
    </article>
  );
}

const EDGE_ORDER: Array<{ id: string; label: string }> = [
  { id: 'planner-coder', label: 'görev devri' },
  { id: 'coder-reviewer', label: 'diff incelemesi' },
];

function WorkflowLink({ index }: { index: number }) {
  const edges = useStore((state) => state.edges);
  const descriptor = EDGE_ORDER[index];
  const edge = edges.find((item: AgentEdgeState) => item.id === descriptor.id);
  const state = edge?.state ?? 'idle';
  return (
    <div className={`workflow-link is-${state}`} aria-label={`${descriptor.label}: ${edge?.state ?? 'bekliyor'}`}>
      <span>{descriptor.label}</span>
      <span className="link-track" aria-hidden="true" />
      <span>{edge?.state === 'active' ? 'sürüyor' : edge?.state === 'done' ? 'tamam' : edge?.state === 'blocked' ? 'onay bekliyor' : 'bekliyor'}</span>
    </div>
  );
}

function NextAction() {
  const task = useStore((state) => state.task);
  const workspace = useStore((state) => state.workspace);
  const approvals = useStore((state) => state.approvals);
  const changes = useStore((state) => state.changes);
  const openReview = useStore((state) => state.openReview);
  const openFolderDialog = useStore((state) => state.openFolderDialog);

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;

  if (!workspace) {
    return (
      <div className="next-action is-idle">
        <div className="next-action-body">
          <div className="next-action-title">Önce bir proje açın</div>
          <div className="next-action-text">
            Ajanlar yalnızca açık bir proje klasöründe çalışır; dosyalar onayınız olmadan yazılmaz.
          </div>
        </div>
        <button type="button" className="button button-primary" onClick={() => void openFolderDialog()}>
          <FolderIcon size={13} />
          Proje klasörü aç
        </button>
      </div>
    );
  }

  if (pendingApprovals > 0) {
    return (
      <div className="next-action is-waiting">
        <div className="next-action-body">
          <div className="next-action-title">
            {pendingApprovals} onay bekliyor
          </div>
          <div className="next-action-text">
            Ajan sıradaki adıma geçmek için sizin onayınızı bekliyor. Aşağıdaki onay kuyruğundan inceleyin.
          </div>
        </div>
        <Badge tone="warn">eylem gerekli</Badge>
      </div>
    );
  }

  if (pendingChanges > 0) {
    return (
      <div className="next-action is-waiting">
        <div className="next-action-body">
          <div className="next-action-title">İncelenecek {pendingChanges} dosya değişikliği var</div>
          <div className="next-action-text">
            Değişiklikler yalnızca diff’i kabul ettiğinizde diske yazılır; reddederseniz hiçbir şey değişmez.
          </div>
        </div>
        <button type="button" className="button button-primary" onClick={openReview}>
          <CheckIcon size={13} />
          Diff’i incele
        </button>
      </div>
    );
  }

  if (task.status === 'running') {
    return (
      <div className="next-action">
        <div className="next-action-body">
          <div className="next-action-title">Görev çalışıyor</div>
          <div className="next-action-text">
            {task.title || 'Görev'} · ajanlar sırayla ilerliyor; adımları görev günlüğünde izleyebilirsiniz.
          </div>
        </div>
        <Badge tone="accent">sürüyor</Badge>
      </div>
    );
  }

  if (task.status === 'error') {
    return (
      <div className="next-action is-error">
        <div className="next-action-body">
          <div className="next-action-title">Görev hata ile durdu</div>
          <div className="next-action-text">
            Alt paneldeki görev günlüğünde hatanın ayrıntısı var. Sağlayıcı ve anahtar durumunu kontrol edip yeniden
            deneyin.
          </div>
        </div>
        <Badge tone="danger">hata</Badge>
      </div>
    );
  }

  if (task.status === 'done') {
    return (
      <div className="next-action">
        <div className="next-action-body">
          <div className="next-action-title">Görev tamamlandı</div>
          <div className="next-action-text">
            Değişiklikler incelendi. Yeni bir görev yazdığınızda ajanlar yeniden planlamaya başlar.
          </div>
        </div>
        <Badge tone="success">tamamlandı</Badge>
      </div>
    );
  }

  return (
    <div className="next-action is-idle">
      <div className="next-action-body">
        <div className="next-action-title">Sıradaki adım: bir görev tanımlayın</div>
        <div className="next-action-text">
          Planlayıcı görevi böler, kodlayıcı diff önerir, inceleyici değerlendirir. Hiçbir dosya onay olmadan
          yazılmaz.
        </div>
      </div>
      <Badge tone="neutral">{taskStatusLabel(task.status)}</Badge>
    </div>
  );
}

export function GraphView() {
  const task = useStore((state) => state.task);
  const stopTask = useStore((state) => state.stopTask);
  const startTask = useStore((state) => state.startTask);
  const workspace = useStore((state) => state.workspace);
  const changes = useStore((state) => state.changes);
  const openReview = useStore((state) => state.openReview);
  const [input, setInput] = useState('');

  const running = task.status === 'running' || task.status === 'awaiting-approval';
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Görev Grafiği</h1>
          <p className="view-desc">
            Planlayıcı → kodlayıcı → inceleyici. Her devir ve komut sizin onayınızı bekler; dosyalar yalnızca diff
            kabul edildiğinde yazılır.
          </p>
        </div>
        <div className="view-header-actions">
          <span className="row" style={{ gap: 7, fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>
            <StatusDot
              status={
                task.status === 'error'
                  ? 'error'
                  : task.status === 'awaiting-approval'
                    ? 'waiting'
                    : running
                      ? 'running'
                      : task.status === 'done'
                        ? 'done'
                        : 'idle'
              }
            />
            {taskStatusLabel(task.status)}
          </span>
          {pendingChanges > 0 ? (
            <button type="button" className="button button-small" onClick={openReview}>
              Diff’i incele ({pendingChanges})
            </button>
          ) : null}
        </div>
      </div>

      <NextAction />

      <div className="graph-toolbar">
        <input
          className="graph-task-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !running) {
              const title = input.trim();
              if (!title) return;
              setInput('');
              void startTask(title);
            }
          }}
          placeholder={
            workspace
              ? task.title
                ? `Son görev: ${task.title}`
                : 'Bir görev yazın, örn. "Görev başlığını kısalt ve yardımcı fonksiyon ekle"'
              : 'Önce bir proje klasörü açın'
          }
          disabled={!workspace || running}
          aria-label="Görev tanımı"
        />
        {running ? (
          <button type="button" className="button button-danger" onClick={stopTask}>
            <StopIcon size={12} />
            Durdur
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              const title = input.trim();
              if (!title) return;
              setInput('');
              void startTask(title);
            }}
            disabled={!workspace || !input.trim()}
          >
            <PlayIcon size={12} />
            Görevi başlat
          </button>
        )}
        {workspace ? (
          <span className="dim" style={{ fontSize: 'var(--fs-2xs)' }}>
            {workspace.name}
          </span>
        ) : null}
      </div>

      <div className="workflow">
        <AgentCard role="planner" />
        <WorkflowLink index={0} />
        <AgentCard role="coder" />
        <WorkflowLink index={1} />
        <AgentCard role="reviewer" />
      </div>

      <section className="approval-queue" aria-label="Onay kuyruğu">
        <div className="section-title">
          <span>Onay kuyruğu</span>
          <span className="section-hint">Yeni görevler ve komutlar otomatik yürütülmez</span>
        </div>
        <ApprovalList />
      </section>
    </div>
  );
}

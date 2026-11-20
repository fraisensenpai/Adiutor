import { useState } from 'react';
import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import type { AgentEdgeState, AgentNodeState, AgentRole } from '@shared/types';
import { ApprovalList } from './ApprovalList';
import { Badge, StatusDot } from './ui/primitives';
import { PlayIcon, StopIcon } from './ui/Icons';
import { formatTime, roleLabel, statusLabel, taskStatusLabel } from '@/lib/format';

const ROLES: AgentRole[] = ['planner', 'coder', 'reviewer'];

const CARD_POSITIONS: Record<AgentRole, { left: number; top: number }> = {
  planner: { left: 24, top: 86 },
  coder: { left: 396, top: 86 },
  reviewer: { left: 768, top: 86 },
};

const EDGE_GEOMETRY: Record<string, { fromX: number; toX: number; y: number; labelX: number }> = {
  'planner-coder': { fromX: 288, toX: 396, y: 180, labelX: 342 },
  'coder-reviewer': { fromX: 660, toX: 768, y: 180, labelX: 714 },
};

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
  const isDemo = settings.provider === 'demo';
  const position = CARD_POSITIONS[role];
  const accentClass = agent.role === 'planner' ? 'is-planner' : agent.role === 'coder' ? 'is-coder' : 'is-reviewer';

  return (
    <article
      className={`agent-card ${accentClass}`}
      style={{ left: position.left, top: position.top }}
      aria-label={`${agent.name} ajanı`}
    >
      <div className="agent-card-head">
        <span className="agent-avatar" aria-hidden="true">
          {agent.name.slice(0, 1).toLocaleUpperCase('tr-TR')}
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
            <span className="dim">· {formatTokens(agent.tokens)} token</span>
            {agent.estimatedTokens > 0 ? <Badge tone="demo">tahmini</Badge> : null}
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
          <input
            id={`model-${role}`}
            className="input"
            list={`models-${role}`}
            value={isDemo ? 'demo-planner' : agent.model}
            onChange={(event) => setAgentModel(role, event.target.value)}
            disabled={isDemo}
            spellCheck={false}
            title={isDemo ? 'Demo modunda gerçek model seçilemez.' : 'Model kimliği'}
          />
          <datalist id={`models-${role}`}>
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
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
          <div className="dim" style={{ fontSize: 10.5 }}>
            {role === 'planner'
              ? 'Görevi alt adımlara böler, kodlama görevini onaya sunar.'
              : role === 'coder'
                ? 'İlgili dosyalarda diff önerir; dosyaya yazmaz.'
                : 'Diff’i inceler, riskleri ve eksik testleri bildirir.'}
          </div>
        )}
        <div className="agent-token-line">
          <span>{role === 'planner' ? 'plan' : role === 'coder' ? 'kod' : 'inceleme'}</span>
          <span>
            {agent.estimatedTokens > 0 ? 'tahmini ' : ''}
            {formatTokens(agent.tokens)} token
          </span>
        </div>
      </div>
    </article>
  );
}

function Edges() {
  const edges = useStore((state) => state.edges);
  return (
    <>
      <svg className="edge-layer" viewBox="0 0 1056 470" preserveAspectRatio="none" aria-hidden="true">
        {edges.map((edge: AgentEdgeState) => {
          const geometry = EDGE_GEOMETRY[edge.id];
          if (!geometry) return null;
          const className = `edge-path is-${edge.state}`;
          return (
            <g key={edge.id}>
              <path
                className={className}
                d={`M ${geometry.fromX} ${geometry.y} C ${geometry.fromX + 20} ${geometry.y}, ${
                  geometry.toX - 20
                } ${geometry.y}, ${geometry.toX - 8} ${geometry.y}`}
              />
              <polygon
                className={`edge-arrow is-${edge.state}`}
                points={`${geometry.toX - 8},${geometry.y - 4} ${geometry.toX},${geometry.y} ${geometry.toX - 8},${
                  geometry.y + 4
                }`}
                style={{
                  fill:
                    edge.state === 'active'
                      ? 'var(--accent)'
                      : edge.state === 'done'
                        ? '#4a6a58'
                        : edge.state === 'blocked'
                          ? '#6b5a2e'
                          : '#2f3947',
                }}
              />
            </g>
          );
        })}
      </svg>
      {edges.map((edge) => {
        const geometry = EDGE_GEOMETRY[edge.id];
        if (!geometry) return null;
        return (
          <span
            key={`label-${edge.id}`}
            className={`edge-label ${edge.state === 'active' ? 'is-active' : ''}`}
            style={{ left: geometry.labelX, top: geometry.y - 13 }}
          >
            {edge.label}
            {edge.state === 'active' ? ' …' : ''}
          </span>
        );
      })}
    </>
  );
}

export function GraphView() {
  const task = useStore((state) => state.task);
  const stopTask = useStore((state) => state.stopTask);
  const startTask = useStore((state) => state.startTask);
  const workspace = useStore((state) => state.workspace);
  const changes = useStore((state) => state.changes);
  const openReview = useStore((state) => state.openReview);
  const agents = useStore((state) => state.agents);
  const [input, setInput] = useState('');

  const running = task.status === 'running' || task.status === 'awaiting-approval';
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Görev Grafiği</h1>
          <p className="view-desc">
            Planlayıcı görevi böler, kodlayıcı diff üretir, inceleyici diff’i değerlendirir. Oklar görev devrini
            gösterir; her ajanın ürettiği yeni görev ve komut sizin onayınızı bekler.
          </p>
        </div>
        <div className="view-header-actions">
          <Badge tone={task.status === 'error' ? 'danger' : task.status === 'awaiting-approval' ? 'warn' : running ? 'accent' : 'neutral'}>
            {taskStatusLabel(task.status)}
          </Badge>
          {pendingChanges > 0 ? (
            <button type="button" className="button button-small" onClick={openReview}>
              Diff’i incele ({pendingChanges})
            </button>
          ) : null}
        </div>
      </div>

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
                : 'Bir görev yazın, örn. "Görev başlığını kısalt"'
              : 'Önce bir proje klasörü açın'
          }
          disabled={!workspace || running}
          aria-label="Görev tanımı"
        />
        {running ? (
          <button type="button" className="button button-danger" onClick={stopTask}>
            <StopIcon size={12} />
            Görevi durdur
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
        <span className="dim" style={{ fontSize: 11 }}>
          {workspace ? `${workspace.name} · ${Object.values(agents).map((agent) => agent.name).join(' → ')}` : 'Proje yok'}
        </span>
      </div>

      <div className="graph-scroll">
        <div className="graph-canvas">
          <Edges />
          {ROLES.map((role) => (
            <AgentCard key={role} role={role} />
          ))}
        </div>
      </div>

      <div className="graph-footnote">
        <Badge tone="neutral">kenarlar</Badge>
        <span>Planlayıcı → Kodlayıcı: onaylanan görev devri · Kodlayıcı → İnceleyici: diff incelemesi</span>
        <span className="dim">· Animasyon yalnızca etkin kenarda ve hareket azaltma tercihine saygılı.</span>
      </div>

      <section className="approval-queue" aria-label="Onay kuyruğu">
        <div className="panel panel-pad">
          <div className="section-title">
            <span>Onay kuyruğu</span>
            <span className="section-hint">Yeni görevler ve komutlar otomatik yürütülmez</span>
          </div>
          <ApprovalList />
        </div>
      </section>
    </div>
  );
}

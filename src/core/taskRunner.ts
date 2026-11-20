import type { AdiutorApi } from '@shared/api';
import type {
  AgentEdgeState,
  AgentNodeState,
  AgentRole,
  AgentStatus,
  AgentStepResult,
  AppSettings,
  ChatMessage,
  CommandResult,
  CompletionResult,
  ContextItem,
  IndexedFile,
  ProposedChange,
  TaskLogEntry,
  TaskStatus,
  WorkspaceInfo,
} from '@shared/types';
import { diffLines } from '@shared/diff';
import { buildMessages, type AgentFile, type AgentPayload } from './prompts';
import { taskControl } from './taskControl';

export type AgentId = AgentNodeState['id'];
type Level = TaskLogEntry['level'];

export interface TaskRuntime {
  api: AdiutorApi;
  settings: AppSettings;
  workspace: WorkspaceInfo;
  context: ContextItem[];
  digest: string;
  files: AgentFile[];
  indexFiles: IndexedFile[];
  testCommand: string | null;
  taskId: string;
  taskTitle: string;
  patchAgent(id: AgentId, patch: Partial<AgentNodeState>): void;
  addStep(id: AgentId, title: string, detail: string, status: AgentStepResult['status']): void;
  setEdge(id: string, state: AgentEdgeState['state']): void;
  /** Çalışma alanı dışındaki yollar reddedilir; kabul edilirse true döner. */
  addChange(input: {
    filePath: string;
    original: string;
    proposed: string;
    summary: string;
    agentRole: AgentRole;
  }): boolean;
  getChanges(): ProposedChange[];
  /** Göreli dosya yolundan içerik okur (çalışma alanı dışına çıkmaz). */
  readFile(path: string): Promise<string | null>;
  relativePath(path: string): string;
  requestApproval(input: {
    type: 'new-task' | 'command';
    from: AgentId;
    title: string;
    description: string;
    command?: string;
    targetRole?: AgentRole;
  }): Promise<boolean>;
  addChat(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  setTaskStatus(status: TaskStatus): void;
  recordUsage(result: CompletionResult, agent: AgentRole | 'chat', purpose: string): void;
  log(level: Level, message: string, agent?: AgentRole): void;
  runCommand(command: string): Promise<CommandResult>;
  hasPendingChanges(): boolean;
}

interface PlanResult {
  summary?: string;
  steps?: Array<{ title?: string; detail?: string }>;
  assignments?: Array<{ role?: string; title?: string; instructions?: string }>;
}

interface CodeResult {
  summary?: string;
  changes?: Array<{ filePath?: string; newContent?: string; summary?: string }>;
}

interface ReviewResult {
  verdict?: string;
  notes?: string;
  issues?: Array<{ severity?: string; message?: string }>;
  command?: { command?: string; reason?: string };
  newTask?: { title?: string; instructions?: string };
}

interface Assignment {
  title: string;
  instructions: string;
}

let sequence = 0;
function makeId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n…(${value.length - max} karakter kırpıldı)` : value;
}

function safeJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const AGENT_LABEL: Record<AgentId, string> = {
  planner: 'Planlayıcı',
  coder: 'Kodlayıcı',
  reviewer: 'İnceleyici',
};

async function callAgent(
  runtime: TaskRuntime,
  agent: AgentId,
  purpose: AgentPayload['purpose'],
  payload: AgentPayload,
  maxTokens: number,
): Promise<{ json: unknown; result: CompletionResult }> {
  const { settings } = runtime;
  const provider = settings.provider;
  const model =
    provider === 'demo' ? 'demo-planner' : settings.agents[agent].model || settings.model;
  const requestId = makeId('req');

  runtime.patchAgent(agent, { status: 'running', model });
  taskControl.track(requestId);

  try {
    const result = await runtime.api.providers.complete({
      requestId,
      provider,
      model,
      messages: buildMessages(provider, purpose, payload, agent),
      maxTokens,
      temperature: purpose === 'review' ? 0.1 : 0.2,
      jsonMode: true,
      purpose,
      agentRole: agent,
      taskId: runtime.taskId,
    });
    runtime.recordUsage(result, agent, purpose);
    runtime.log(
      'info',
      `${AGENT_LABEL[agent]}: ${result.usage.totalTokens} token (${
        result.usage.estimated ? 'tahmini' : 'ölçüldü'
      }), ${result.latencyMs} ms`,
      agent,
    );
    if (!result.text.trim()) {
      throw new Error('Ajan boş yanıt döndürdü.');
    }
    return { json: safeJson(result.text), result };
  } finally {
    taskControl.untrack(requestId);
  }
}

function markStopped(runtime: TaskRuntime): void {
  for (const agent of ['planner', 'coder', 'reviewer'] as const) {
    runtime.patchAgent(agent, { status: 'stopped', lastMessage: 'Kullanıcı görevi durdurdu.' });
  }
  runtime.setTaskStatus('stopped');
  runtime.log('warn', 'Görev kullanıcı tarafından durduruldu. Onay bekleyen adımlar iptal edildi.');
}

function markError(runtime: TaskRuntime, agent: AgentId, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Bilinmeyen hata.';
  runtime.patchAgent(agent, { status: 'error', lastMessage: message });
  runtime.addStep(agent, 'Adım başarısız', message, 'error');
  runtime.log('error', message, agent);
  runtime.setTaskStatus('error');
  void runtime.addChat({
    role: 'system',
    agentRole: agent,
    error: true,
    content: `**${AGENT_LABEL[agent]} adımı başarısız oldu.**\n\n${message}`,
  });
}

function finish(runtime: TaskRuntime): void {
  const pending = runtime.hasPendingChanges();
  runtime.setTaskStatus(pending ? 'awaiting-approval' : 'done');
  for (const agent of ['planner', 'coder', 'reviewer'] as const) {
    const nodeStatus: AgentStatus = pending && agent === 'reviewer' ? 'awaiting-approval' : 'done';
    runtime.patchAgent(agent, {
      status: nodeStatus,
      ...(pending && agent === 'reviewer'
        ? { lastMessage: 'Diff onayınızı bekliyor; dosyalar henüz yazılmadı.' }
        : {}),
    });
    runtime.setEdge(agent === 'planner' ? 'planner-coder' : 'coder-reviewer', 'done');
  }
  runtime.log(
    pending ? 'warn' : 'success',
    pending
      ? 'Öneriler hazır. Dosyalara yazılmadı; "Değişiklikleri incele" ile kabul edin.'
      : 'Görev tamamlandı; uygulanacak yeni değişiklik yok.',
  );
}

async function runCoder(
  runtime: TaskRuntime,
  assignment: Assignment,
  pass: number,
): Promise<number> {
  if (taskControl.isCancelled()) return 0;
  if (!runtime.settings.agents.coder.enabled) {
    runtime.log('warn', 'Kodlayıcı ajan devre dışı; kodlama adımı atlandı.', 'coder');
    return 0;
  }
  runtime.setEdge('planner-coder', 'active');
  runtime.patchAgent('coder', { lastMessage: 'Değişiklik önerileri hazırlanıyor…' });

  const payload: AgentPayload = {
    purpose: 'code',
    task: runtime.taskTitle,
    instructions: assignment.instructions,
    digest: runtime.digest,
    files: runtime.files,
  };

  try {
    const { json, result } = await callAgent(runtime, 'coder', 'code', payload, 3000);
    if (taskControl.isCancelled()) return 0;
    const parsed = (json ?? {}) as CodeResult;
    const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
    const recordedChanges: Array<{ path: string; summary: string }> = [];
    let added = 0;

    for (const change of changes.slice(0, 4)) {
      if (!change.filePath || typeof change.newContent !== 'string') continue;
      const original =
        runtime.files.find((file) => file.path === change.filePath)?.content ??
        (await runtime.readFile(change.filePath));
      if (original === null) {
        runtime.log('warn', `Dosya okunamadı, değişiklik atlandı: ${change.filePath}`, 'coder');
        continue;
      }
      if (original === change.newContent) {
        runtime.log('warn', `Kodlayıcı ${change.filePath} için değişiklik üretmedi.`, 'coder');
        continue;
      }
      const recorded = runtime.addChange({
        filePath: change.filePath,
        original,
        proposed: change.newContent,
        summary: change.summary ?? parsed.summary ?? 'Kod değişikliği',
        agentRole: 'coder',
      });
      if (!recorded) {
        runtime.log('warn', `Kapsam dışı dosya önerisi reddedildi: ${change.filePath}`, 'coder');
        continue;
      }
      recordedChanges.push({
        path: runtime.relativePath(change.filePath),
        summary: change.summary ?? 'Değişiklik',
      });
      added += 1;
    }

    if (added === 0 && !parsed.summary) {
      throw new Error('Kodlayıcı geçerli bir değişiklik üretmedi. Bağlama dosya ekleyip tekrar deneyin.');
    }

    runtime.addStep(
      'coder',
      `${pass > 1 ? 'Ek ' : ''}Değişiklik önerisi`,
      `${added} dosya için diff hazırlandı (dosyaya yazılmadı).`,
      'done',
    );
    runtime.patchAgent('coder', {
      status: 'done',
      lastMessage: parsed.summary ?? `${added} dosyada değişiklik önerildi.`,
    });
    await runtime.addChat({
      role: 'assistant',
      agentRole: 'coder',
      model: result.model,
      demo: result.demo,
      content: [
        `**Kodlayıcı — ${added} dosyada öneri**`,
        '',
        parsed.summary ?? '',
        '',
        ...recordedChanges.map((change) => `- \`${change.path}\`: ${change.summary}`),
        '',
        added > 0
          ? 'Değişiklikler dosyalara **yazılmadı**. Sağ üstteki "Değişiklikleri incele" düğmesinden diff’i açabilirsiniz.'
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
    runtime.setEdge('planner-coder', 'done');
    return added;
  } catch (error) {
    markError(runtime, 'coder', error);
    throw error;
  }
}

async function runReviewer(runtime: TaskRuntime, allowFollowUp: boolean): Promise<void> {
  if (taskControl.isCancelled()) return;
  if (!runtime.settings.agents.reviewer.enabled) {
    runtime.log('warn', 'İnceleyici ajan devre dışı; inceleme atlandı.', 'reviewer');
    return;
  }
  const changes = runtime.getChanges();
  if (changes.length === 0) return;

  runtime.setEdge('coder-reviewer', 'active');
  runtime.patchAgent('reviewer', { lastMessage: 'Diff inceleniyor…' });

  const payload: AgentPayload = {
    purpose: 'review',
    task: runtime.taskTitle,
    changes: changes.map((change) => {
      const diff = diffLines(change.original, change.proposed);
      return {
        path: runtime.relativePath(change.filePath),
        additions: diff.additions,
        deletions: diff.deletions,
        summary: change.summary,
        diff: truncate(
          diff.rows
            .map((row) => `${row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}${row.text}`)
            .join('\n'),
          6000,
        ),
      };
    }),
    hasTestScript: Boolean(runtime.testCommand),
    testCommand: runtime.testCommand ?? undefined,
  };

  try {
    const { json, result } = await callAgent(runtime, 'reviewer', 'review', payload, 1500);
    if (taskControl.isCancelled()) return;
    const parsed = (json ?? {}) as ReviewResult;
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const verdict = parsed.verdict === 'düzeltme-gerekli' ? 'düzeltme-gerekli' : 'onayla';

    runtime.addStep(
      'reviewer',
      verdict === 'onayla' ? 'İnceleme tamamlandı' : 'Düzeltme gerekli',
      parsed.notes ?? `${issues.length} not`,
      'done',
    );
    runtime.patchAgent('reviewer', {
      status: 'done',
      lastMessage: parsed.notes ?? verdict,
    });
    await runtime.addChat({
      role: 'assistant',
      agentRole: 'reviewer',
      model: result.model,
      demo: result.demo,
      content: [
        `**İnceleyici — ${verdict === 'onayla' ? 'onay önerisi' : 'düzeltme önerisi'}**`,
        '',
        parsed.notes ?? '',
        ...(issues.length
          ? ['', ...issues.slice(0, 5).map((issue) => `- _${issue.severity ?? 'bilgi'}:_ ${issue.message ?? ''}`)]
          : []),
      ]
        .filter(Boolean)
        .join('\n'),
    });
    runtime.setEdge('coder-reviewer', 'done');

    // Komut önerisi: kullanıcı onayı olmadan çalıştırılmaz.
    if (parsed.command?.command) {
      const command = parsed.command.command;
      const approved = await runtime.requestApproval({
        type: 'command',
        from: 'reviewer',
        title: `Komut çalıştır: ${command}`,
        description:
          parsed.command.reason ?? 'İnceleyici ajan bu komutun doğrulama için çalışmasını öneriyor.',
        command,
      });
      if (taskControl.isCancelled()) return;
      if (approved) {
        runtime.patchAgent('reviewer', { lastMessage: `Komut çalıştırılıyor: ${command}` });
        const commandResult = await runtime.runCommand(command);
        runtime.patchAgent('reviewer', {
          status: 'done',
          lastMessage: `Komut çalıştırıldı: ${command} (çıkış ${commandResult.code})`,
        });
        runtime.log(
          commandResult.code === 0 ? 'success' : 'warn',
          `Komut tamamlandı: ${command} (çıkış ${commandResult.code}, ${commandResult.durationMs} ms)`,
          'reviewer',
        );
        await runtime.addChat({
          role: 'system',
          agentRole: 'reviewer',
          content: `**Komut çıktısı** — \`${command}\` (çıkış kodu ${commandResult.code})\n\n\`\`\`\n${truncate(
            commandResult.output.trim() || '(çıktı yok)',
            3000,
          )}\n\`\`\``,
        });
      } else {
        runtime.patchAgent('reviewer', { lastMessage: `Komut reddedildi: ${command}` });
        runtime.log('warn', `Komut kullanıcı tarafından reddedildi: ${command}`, 'reviewer');
      }
    }

    if (allowFollowUp && parsed.newTask?.title) {
      const approved = await runtime.requestApproval({
        type: 'new-task',
        from: 'reviewer',
        targetRole: 'coder',
        title: parsed.newTask.title,
        description: parsed.newTask.instructions ?? parsed.newTask.title,
      });
      if (taskControl.isCancelled()) return;
      if (approved) {
        runtime.log('info', `İnceleyicinin yeni görevi onaylandı: ${parsed.newTask.title}`, 'reviewer');
        await runCoder(
          runtime,
          {
            title: parsed.newTask.title,
            instructions: parsed.newTask.instructions ?? parsed.newTask.title,
          },
          2,
        );
        await runReviewer(runtime, false);
      } else {
        runtime.log('warn', 'İnceleyicinin önerdiği yeni görev reddedildi.', 'reviewer');
      }
    }
  } catch (error) {
    markError(runtime, 'reviewer', error);
    throw error;
  }
}

export async function runTask(runtime: TaskRuntime): Promise<void> {
  taskControl.reset();
  runtime.setTaskStatus('running');
  runtime.log('info', `Görev başladı: ${runtime.taskTitle}`);
  for (const agent of ['planner', 'coder', 'reviewer'] as const) {
    runtime.patchAgent(agent, { status: 'idle', steps: [], lastMessage: undefined });
  }
  runtime.setEdge('planner-coder', 'idle');
  runtime.setEdge('coder-reviewer', 'idle');

  try {
    let assignments: Assignment[] = [
      { title: runtime.taskTitle, instructions: runtime.taskTitle },
    ];

    if (runtime.settings.agents.planner.enabled) {
      runtime.patchAgent('planner', { status: 'running', lastMessage: 'Görev alt adımlara bölünüyor…' });
      const payload: AgentPayload = {
        purpose: 'plan',
        task: runtime.taskTitle,
        workspaceName: runtime.workspace.name,
        digest: runtime.digest,
        files: runtime.files,
        contextLabels: runtime.context.map((item) => item.label),
      };
      const { json, result } = await callAgent(runtime, 'planner', 'plan', payload, 1200);
      if (taskControl.isCancelled()) return markStopped(runtime);
      const plan = (json ?? {}) as PlanResult;

      const steps = Array.isArray(plan.steps) ? plan.steps.slice(0, 3) : [];
      for (const step of steps) {
        runtime.addStep('planner', step.title ?? 'Adım', step.detail ?? '', 'done');
      }
      runtime.patchAgent('planner', {
        status: 'done',
        lastMessage: plan.summary ?? 'Plan hazır.',
      });
      await runtime.addChat({
        role: 'assistant',
        agentRole: 'planner',
        model: result.model,
        demo: result.demo,
        content: [
          '**Planlayıcı — plan hazır**',
          '',
          plan.summary ?? '',
          ...(steps.length
            ? ['', ...steps.map((step, index) => `${index + 1}. ${step.title ?? ''}${step.detail ? ` — ${step.detail}` : ''}`)]
            : []),
          '',
          'Kodlama görevi onayınızı bekliyor. Onaylamadan hiçbir dosya değişmez.',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      runtime.log('success', 'Plan oluşturuldu; kodlama görevi onay bekliyor.', 'planner');

      if (Array.isArray(plan.assignments) && plan.assignments.length > 0) {
        assignments = plan.assignments.slice(0, 2).map((assignment) => ({
          title: assignment.title ?? runtime.taskTitle,
          instructions: assignment.instructions ?? assignment.title ?? runtime.taskTitle,
        }));
      }
    } else {
      runtime.log('warn', 'Planlayıcı ajan devre dışı; görev doğrudan kodlayıcıya veriliyor.');
    }

    let producedAny = false;
    for (const assignment of assignments) {
      if (taskControl.isCancelled()) return markStopped(runtime);
      const approved = await runtime.requestApproval({
        type: 'new-task',
        from: 'planner',
        targetRole: 'coder',
        title: assignment.title,
        description: assignment.instructions,
      });
      if (taskControl.isCancelled()) return markStopped(runtime);
      if (!approved) {
        runtime.log('warn', `Kodlama görevi reddedildi: ${assignment.title}`, 'planner');
        runtime.patchAgent('planner', { status: 'done', lastMessage: 'Kodlama görevi reddedildi.' });
        break;
      }
      runtime.patchAgent('planner', {
        status: 'done',
        lastMessage: 'Kodlama görevi onaylandı; kodlayıcıya devredildi.',
      });
      runtime.log('info', `Kodlama görevi onaylandı: ${assignment.title}`, 'planner');
      const added = await runCoder(runtime, assignment, 1);
      producedAny = producedAny || added > 0;
    }

    if (producedAny) {
      await runReviewer(runtime, true);
    }
    if (taskControl.isCancelled()) return markStopped(runtime);
    finish(runtime);
  } catch {
    if (taskControl.isCancelled()) {
      markStopped(runtime);
      return;
    }
    // markError ajan adımında çağrıldı; üretilmiş öneriler varsa yine de incelemeye sunulur.
    if (runtime.getChanges().length > 0) {
      finish(runtime);
    }
  }
}

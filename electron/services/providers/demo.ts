import type { CompletionRequest, CompletionResult, ProviderInfo } from '../../../src/shared/types';
import { estimateTokens } from '../../../src/shared/tokens';
import type { ProviderAdapter } from './types';

/**
 * Demo sağlayıcı.
 *
 * Ağ bağlantısı KURMAZ ve hiçbir model çağırmaz. Ürettiği plan/diff/inceleme
 * metinleri kurallı olarak hazırlanır. Arayüzde bu sağlayıcının çıktısı her
 * zaman "demo" olarak etiketlenir; gerçek model çıktısıyla karıştırılmaz.
 */

const info: ProviderInfo = {
  id: 'demo',
  label: 'Demo (ağ yok)',
  kind: 'demo',
  requiresApiKey: false,
  models: ['demo-planner'],
  defaultModel: 'demo-planner',
  note: 'Tüm yanıtlar kurallı olarak üretilir. Gerçek model çağrısı yapılmaz, dosyalar yalnızca onay verirseniz yazılır.',
};

interface DemoFile {
  path: string;
  content: string;
  reason?: string;
}

interface DemoPayload {
  purpose?: string;
  task?: string;
  workspaceName?: string;
  files?: DemoFile[];
  plan?: { assignments?: Array<{ title?: string }> };
  changes?: Array<{ path: string; additions?: number; deletions?: number; summary?: string }>;
  reviewerNotes?: string;
  hasTestScript?: boolean;
  testCommand?: string;
  contextLabels?: string[];
  [key: string]: unknown;
}

interface DemoChange {
  filePath: string;
  newContent: string;
  summary: string;
}

const DEMO_MARKER = 'Adiutor demo önerisi';

function slug(value: string): string {
  const map: Record<string, string> = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
  };
  return value
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (char) => map[char] ?? char)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .map((word, index) =>
      index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
}

function commentFor(filePath: string, task: string): string {
  if (filePath.endsWith('.py')) {
    return `# ${DEMO_MARKER} — ${task}\n# Bu içerik demo modunda kurallı olarak üretildi; gerçek model çağrısı yapılmadı.`;
  }
  return `/**\n * ${DEMO_MARKER} — ${task}\n * Bu içerik demo modunda kurallı olarak üretildi; gerçek model çağrısı yapılmadı.\n */`;
}

function buildChange(file: DemoFile | undefined, task: string): DemoChange | null {
  if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') return null;
  const baseName = file.path.split(/[\\/]/).pop() ?? 'dosya';
  const identifier = slug(task) || 'gorev';
  const isPython = file.path.endsWith('.py');
  const content = file.content;

  // Aynı demo bloğu ikinci kez eklenmesin.
  if (content.includes(DEMO_MARKER)) {
    return {
      filePath: file.path,
      newContent: content,
      summary: `${baseName}: demo bloğu zaten mevcut, değişiklik gerekmedi.`,
    };
  }

  const separator = content.endsWith('\n') ? '\n' : '\n\n';
  const addition = isPython
    ? `${commentFor(file.path, task)}\n\ndef demo_${identifier.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}(value: str) -> str:\n    """Demo modunda eklenen yardımcı fonksiyon."""\n    return value.strip().casefold()\n`
    : `${commentFor(file.path, task)}\nexport function demo${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}(value: string): string {\n  return value.trim().toLocaleLowerCase('tr-TR');\n}\n`;

  return {
    filePath: file.path,
    newContent: `${content}${separator}${addition}`,
    summary: `${baseName}: açıklayıcı demo bloğu ve yardımcı fonksiyon eklendi.`,
  };
}

function planPayload(payload: DemoPayload): string {
  const task = payload.task ?? 'Görev';
  const files = payload.files ?? [];
  const primary = files[0]?.path?.split(/[\\/]/).pop() ?? 'ana kaynak dosya';
  const secondary = files[1]?.path?.split(/[\\/]/).pop();

  return JSON.stringify({
    summary: `"${task}" görevi ${files.length || 1} dosya üzerinde ele alınacak. Demo planlayıcı yalnızca proje özetini kullandı.`,
    steps: [
      {
        title: 'Bağlamı çıkar',
        detail: `${primary}${secondary ? ` ve ${secondary}` : ''} incelenecek; gizli dosyalar ve .env dışarıda bırakılacak.`,
      },
      {
        title: 'Kodu değiştir',
        detail: 'Kodlayıcı ajan öneriyi üretir; dosyaya doğrudan yazılmaz, diff olarak gösterilir.',
      },
      {
        title: 'Diff’i incele',
        detail: 'İnceleyici ajan değişikliği okur, riskleri ve eksik testleri bildirir.',
      },
    ],
    assignments: [
      {
        role: 'coder',
        title: `Kodu düzenle: ${task}`,
        instructions: `Şu dosyalarda küçük ve geri alınabilir bir değişiklik öner: ${files
          .map((file) => file.path)
          .join(', ') || primary}. Mevcut davranışı bozma.`,
      },
    ],
  });
}

function codePayload(payload: DemoPayload): string {
  const task = payload.task ?? 'Demo görevi';
  const files = payload.files ?? [];
  const changes = files
    .slice(0, 2)
    .map((file) => buildChange(file, task))
    .filter((change): change is DemoChange => Boolean(change));

  return JSON.stringify({
    summary: changes.length
      ? `Demo kodlayıcı ${changes.length} dosya için değişiklik önerdi. Hiçbir dosya onayınız olmadan yazılmadı.`
      : 'Bağlamda değiştirilebilir kaynak dosya bulunamadı.',
    changes: changes.map((change) => ({
      filePath: change.filePath,
      newContent: change.newContent,
      summary: change.summary,
    })),
  });
}

function reviewPayload(payload: DemoPayload): string {
  const changes = payload.changes ?? [];
  const totalAdditions = changes.reduce((sum, change) => sum + (change.additions ?? 0), 0);
  const issues: Array<{ severity: string; message: string }> = [];

  if (changes.length === 0) {
    issues.push({ severity: 'uyarı', message: 'Değişiklik bulunamadı; inceleme yapılamadı.' });
  }
  if (changes.length > 1) {
    issues.push({
      severity: 'bilgi',
      message: 'Birden fazla dosya değişti; değişikliklerin birlikte test edilmesi önerilir.',
    });
  }
  if (payload.hasTestScript) {
    issues.push({
      severity: 'bilgi',
      message: 'Projede test betiği var; demo inceleme çalıştırmadı, onay verirseniz çalıştırılabilir.',
    });
  }

  const command =
    payload.hasTestScript && payload.testCommand
      ? {
          command: payload.testCommand,
          reason: 'İnceleyici ajan değişikliğin doğrulanması için testleri çalıştırmak istiyor.',
        }
      : undefined;

  return JSON.stringify({
    verdict: changes.length === 0 ? 'düzeltme-gerekli' : 'onayla',
    notes: `Demo inceleme: ${changes.length} dosyada ${totalAdditions} satır eklendi. ${
      payload.reviewerNotes ?? 'Değişiklikler kapsamı dar tutulmuş görünüyor; yine de kabul etmeden önce diff’i okuyun.'
    }`,
    issues,
    ...(command ? { command } : {}),
  });
}

function chatReply(payload: DemoPayload): string {
  const labels = payload.contextLabels ?? [];
  const task = payload.task ?? '';
  const contextLine = labels.length
    ? `Bağlamda şu parçalar var: ${labels.slice(0, 5).join(', ')}${labels.length > 5 ? '…' : ''}.`
    : 'Bağlama henüz dosya eklenmedi; soldaki dosya ağacından veya Proje Haritası’ndan ekleyebilirsiniz.';
  return [
    '**Demo yanıtı** — gerçek bir model çağrısı yapılmadı.',
    '',
    contextLine,
    '',
    task
      ? `"${task}" için izlenecek yol: önce Görev Grafiği’nde planlayıcıyı çalıştırın, üretilen kodlama görevini onaylayın, ardından diff’i inceleyip değişiklikleri tek tek kabul edin.`
      : 'Bir görev yazıp "Görevi başlat" düğmesini kullanabilirsiniz; ajanlar sırayla plan → kod → inceleme adımlarını yürütür.',
    '',
    'Gerçek model yanıtları için Ayarlar → Sağlayıcı bölümünden OpenAI anahtarı ekleyin.',
  ].join('\n');
}

function parsePayload(request: CompletionRequest): DemoPayload {
  const last = [...request.messages].reverse().find((message) => message.role === 'user');
  if (!last) return {};
  try {
    const parsed = JSON.parse(last.content) as DemoPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { task: last.content.slice(0, 400) };
  }
}

export const demoProvider: ProviderAdapter = {
  info,
  async complete(request): Promise<CompletionResult> {
    const startedAt = Date.now();
    const payload = parsePayload(request);
    const purpose = payload.purpose ?? request.purpose;

    // Küçük gecikme: arayüzde yüklenme durumları görülebilsin.
    await new Promise((resolve) => setTimeout(resolve, 350));

    let text = '';
    switch (purpose) {
      case 'plan':
        text = planPayload(payload);
        break;
      case 'code':
        text = codePayload(payload);
        break;
      case 'review':
        text = reviewPayload(payload);
        break;
      default:
        text = chatReply(payload);
    }

    const promptText = request.messages.map((message) => message.content).join('\n');
    const promptTokens = estimateTokens(promptText);
    const completionTokens = estimateTokens(text);

    return {
      requestId: request.requestId,
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimated: true,
      },
      model: request.model || info.defaultModel,
      provider: 'demo',
      demo: true,
      latencyMs: Date.now() - startedAt,
    };
  },
};

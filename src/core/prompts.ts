import type { ContextItem, IndexSnapshot, ProviderId, ChatTurn } from '@shared/types';

export interface AgentFile {
  path: string;
  content: string;
  reason?: string;
}

export interface PlanPayload {
  purpose: 'plan';
  task: string;
  workspaceName: string;
  digest: string;
  files: AgentFile[];
  contextLabels: string[];
}

export interface CodePayload {
  purpose: 'code';
  task: string;
  instructions: string;
  digest: string;
  files: AgentFile[];
}

export interface ReviewPayload {
  purpose: 'review';
  task: string;
  changes: Array<{
    path: string;
    additions: number;
    deletions: number;
    summary: string;
    diff: string;
  }>;
  hasTestScript: boolean;
  testCommand?: string;
}

export interface ChatPayload {
  purpose: 'chat';
  task: string;
  workspaceName: string;
  digest: string;
  files: AgentFile[];
  contextLabels: string[];
}

export type AgentPayload = PlanPayload | CodePayload | ReviewPayload | ChatPayload;

/** Proje özeti: her istekte tüm proje yerine küçük, okunabilir bir harita. */
export function buildWorkspaceDigest(
  index: IndexSnapshot | null,
  workspaceName: string,
  contextItems: ContextItem[],
  maxChars = 1800,
): string {
  if (!index || index.files.length === 0) {
    return `Proje: ${workspaceName}. İndeks henüz hazır değil veya kaynak dosya bulunamadı.`;
  }
  const lines: string[] = [];
  lines.push(`Proje: ${workspaceName} — ${index.files.length} dosya indekslendi.`);
  const byLanguage = new Map<string, number>();
  for (const file of index.files) {
    byLanguage.set(file.language, (byLanguage.get(file.language) ?? 0) + 1);
  }
  lines.push(
    `Diller: ${[...byLanguage.entries()].map(([language, count]) => `${language}(${count})`).join(', ')}`,
  );

  const relative = (file: string) => file.replace(/\\/g, '/').split('/').slice(-4).join('/');
  const notable = index.files
    .slice()
    .sort((a, b) => b.symbolCount - a.symbolCount)
    .slice(0, 24)
    .map((file) => `${relative(file.path)} (${file.symbolCount} sembol, ${file.lines} satır)`);
  if (notable.length > 0) {
    lines.push('Öne çıkan dosyalar:');
    for (const entry of notable) lines.push(`- ${entry}`);
  }

  if (contextItems.length > 0) {
    lines.push(`Kullanıcının bağlama ekledikleri: ${contextItems.map((item) => item.label).join(', ')}`);
  }

  const digest = lines.join('\n');
  return digest.length > maxChars ? `${digest.slice(0, maxChars)}…` : digest;
}

const SHARED_RULES = `Kurallar:
- Yalnızca verilen bağlamı kullan; bağlamda olmayan dosyalar hakkında varsayım yapma.
- Gizli dosyalar, .env dosyaları ve anahtarlar bağlama dahil edilmez; onları isteme.
- Kod değişikliğini hiçbir zaman doğrudan dosyaya yazma; yalnızca öneri üret.
- Yanıtı SADECE geçerli JSON olarak ver; JSON dışında metin yazma.
- Türkçe açıklama yaz, kod tanımlayıcıları İngilizce kalabilir.`;

function systemPrompt(purpose: AgentPayload['purpose'], agentLabel: string): string {
  switch (purpose) {
    case 'plan':
      return `${agentLabel}. Kullanıcının görevini küçük, doğrulanabilir adımlara bölüyorsun.
${SHARED_RULES}
JSON şeması: {"summary": string, "steps": [{"title": string, "detail": string}], "assignments": [{"role": "coder", "title": string, "instructions": string}]}
En fazla 3 adım ve 1 kodlama görevi üret.`;
    case 'code':
      return `${agentLabel}. Verilen dosyalarda görevi uygulayan değişiklikleri öneriyorsun.
${SHARED_RULES}
JSON şeması: {"summary": string, "changes": [{"filePath": string, "newContent": string, "summary": string}]}
Her değişiklikte dosyanın TAM yeni içeriğini ver. Yalnızca bağlamda verilen dosyaları değiştir. Kapsamı dar tut; mevcut davranışı bozma.`;
    case 'review':
      return `${agentLabel}. Bir kod değişikliğini inceliyorsun.
${SHARED_RULES}
JSON şeması: {"verdict": "onayla" | "düzeltme-gerekli", "notes": string, "issues": [{"severity": "hata" | "uyarı" | "bilgi", "message": string}], "command"?: {"command": string, "reason": string}}
Sadece gerçekten gerekliyse komut öner; komut kullanıcı onayı olmadan çalıştırılmaz. Yeni bir görev gerekiyorsa "newTask": {"title": string, "instructions": string} ekle.`;
    default:
      return `${agentLabel}. Adiutor masaüstü kod editörünün yardımcı asistanısın.
${SHARED_RULES.replace('- Yanıtı SADECE geçerli JSON olarak ver; JSON dışında metin yazma.', '- Kısa ve uygulanabilir yanıt ver; gerekirse madde işaretleri kullan.')}
Kullanıcıya doğrudan yanıt ver; dosya değiştirme.`;
  }
}

const ROLE_LABEL = { planner: 'Planlayıcı ajan', coder: 'Kodlayıcı ajan', reviewer: 'İnceleyici ajan' };

/** Demo sağlayıcı ham JSON'u okur; OpenAI adaptörü sistem + kullanıcı mesajı alır. */
export function buildMessages(
  provider: ProviderId,
  purpose: AgentPayload['purpose'],
  payload: AgentPayload,
  role: 'planner' | 'coder' | 'reviewer',
): ChatTurn[] {
  if (provider === 'demo') {
    return [{ role: 'user', content: JSON.stringify(payload) }];
  }

  const instructions: Record<AgentPayload['purpose'], string> = {
    plan: 'Aşağıdaki görevi planla. Yanıtı JSON şemasına uygun ver.',
    code: 'Aşağıdaki görev için dosya değişikliklerini JSON olarak öner.',
    review: 'Aşağıdaki diff’i incele ve JSON olarak değerlendir.',
    chat:
      'Aşağıdaki bağlamı ve kullanıcı isteğini yanıtla. Dosya değiştirme, yalnızca açıkla. Yanıtı Markdown olarak ver.',
  };

  return [
    { role: 'system', content: systemPrompt(purpose, ROLE_LABEL[role]) },
    {
      role: 'user',
      content: `${instructions[purpose]}\n\nBAĞLAM (JSON):\n${JSON.stringify(payload)}`,
    },
  ];
}

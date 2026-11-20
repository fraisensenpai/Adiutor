import type { CompletionResult, ProviderInfo } from '../../../src/shared/types';
import { estimateTokens } from '../../../src/shared/tokens';
import { ProviderFailure, type ProviderAdapter, type ProviderContext } from './types';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 120_000;

const info: ProviderInfo = {
  id: 'openai',
  label: 'OpenAI',
  kind: 'api',
  requiresApiKey: true,
  models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o-mini-2024-07-18', 'o4-mini'],
  defaultModel: 'gpt-4.1-mini',
  note: 'Anahtar işletim sisteminin güvenli kasasında tutulur ve yalnızca ana süreçte kullanılır.',
};

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: OpenAiUsage;
  error?: { message?: string; code?: string; type?: string };
}

export const openaiProvider: ProviderAdapter = {
  info,
  async complete(request, context: ProviderContext): Promise<CompletionResult> {
    if (!context.apiKey) {
      throw new ProviderFailure(
        'OpenAI API anahtarı ayarlanmamış. Ayarlar → Sağlayıcı bölümünden anahtar ekleyin.',
        'missing-key',
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    context.signal.addEventListener('abort', onAbort);

    try {
      const body: Record<string, unknown> = {
        model: request.model || info.defaultModel,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
      };
      if (request.maxTokens) body.max_tokens = request.maxTokens;
      if (request.jsonMode) body.response_format = { type: 'json_object' };

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Sağlayıcının hata gövdesi anahtar içermez; yine de yalnızca mesajı aktarırız.
        let detail = '';
        try {
          const parsed = (await response.json()) as OpenAiResponse;
          detail = parsed.error?.message ?? '';
        } catch {
          detail = '';
        }
        throw new ProviderFailure(
          openAiErrorMessage(response.status, detail),
          'http-error',
          response.status,
        );
      }

      const data = (await response.json()) as OpenAiResponse;
      const text = data.choices?.[0]?.message?.content ?? '';
      const promptText = request.messages.map((message) => message.content).join('\n');
      const usage = data.usage;
      const measured = typeof usage?.prompt_tokens === 'number';
      const promptTokens = usage?.prompt_tokens ?? estimateTokens(promptText);
      const completionTokens = usage?.completion_tokens ?? estimateTokens(text);

      return {
        requestId: request.requestId,
        text,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
          estimated: !measured,
        },
        model: request.model || info.defaultModel,
        provider: 'openai',
        demo: false,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      if (controller.signal.aborted) {
        throw new ProviderFailure(
          context.signal.aborted ? 'İstek kullanıcı tarafından durduruldu.' : 'İstek zaman aşımına uğradı (120 sn).',
          context.signal.aborted ? 'aborted' : 'timeout',
        );
      }
      // Ağ hatalarında istek başlıkları/anahtar asla mesaja eklenmez.
      throw new ProviderFailure(
        'OpenAI bağlantısı kurulamadı. İnternet bağlantısını ve sağlayıcı durumunu kontrol edin.',
        'network',
      );
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener('abort', onAbort);
    }
  },
};

function openAiErrorMessage(status: number, detail: string): string {
  switch (status) {
    case 401:
      return 'OpenAI API anahtarı geçersiz veya süresi dolmuş. Ayarlardan anahtarı yenileyin.';
    case 403:
      return 'Bu anahtarın model için erişim yetkisi yok.';
    case 404:
      return 'Seçilen model bulunamadı. Ayarlardan geçerli bir model kimliği seçin.';
    case 429:
      return 'OpenAI istek sınırı (rate limit) aşıldı. Kısa bir süre sonra tekrar deneyin.';
    case 500:
    case 502:
    case 503:
      return 'OpenAI hizmetinde geçici bir hata oluştu. Birazdan tekrar deneyin.';
    default:
      return detail
        ? `OpenAI isteği başarısız (HTTP ${status}): ${detail.slice(0, 300)}`
        : `OpenAI isteği başarısız (HTTP ${status}).`;
  }
}

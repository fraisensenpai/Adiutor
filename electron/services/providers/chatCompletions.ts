import type { CompletionResult, ProviderId, ProviderInfo } from '../../../src/shared/types';
import { estimateTokens } from '../../../src/shared/tokens';
import { ProviderFailure, type ProviderAdapter, type ProviderContext } from './types';

/**
 * OpenAI uyumlu sohbet tamamlama adaptörü.
 *
 * OpenAI, DeepSeek ve xAI (Grok) aynı `/chat/completions` sözleşmesini kullanır;
 * yalnızca uç nokta, model listesi ve kimlik doğrulama başlığı değişir.
 */

export interface ChatCompletionsConfig {
  id: ProviderId;
  label: string;
  endpoint: string;
  models: string[];
  defaultModel: string;
  note: string;
  keyHint: string;
  docsUrl: string;
  /** Sağlayıcının JSON modu desteklemediği durumlar için false. */
  jsonMode?: boolean;
}

const REQUEST_TIMEOUT_MS = 120_000;

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: Usage;
  error?: { message?: string; code?: string; type?: string };
}

function errorMessage(label: string, status: number, detail: string): string {
  switch (status) {
    case 401:
      return `${label} API anahtarı geçersiz veya süresi dolmuş. Ayarlardan anahtarı yenileyin.`;
    case 403:
      return `Bu anahtarın ${label} üzerinde model erişim yetkisi yok.`;
    case 404:
      return `Seçilen model ${label} üzerinde bulunamadı. Ayarlardan geçerli bir model kimliği seçin.`;
    case 429:
      return `${label} istek sınırı aşıldı. Kısa bir süre sonra tekrar deneyin.`;
    case 500:
    case 502:
    case 503:
      return `${label} hizmetinde geçici bir hata oluştu. Birazdan tekrar deneyin.`;
    default:
      return detail
        ? `${label} isteği başarısız (HTTP ${status}): ${detail.slice(0, 300)}`
        : `${label} isteği başarısız (HTTP ${status}).`;
  }
}

export function createChatCompletionsProvider(config: ChatCompletionsConfig): ProviderAdapter {
  const info: ProviderInfo = {
    id: config.id,
    label: config.label,
    requiresApiKey: true,
    models: config.models,
    defaultModel: config.defaultModel,
    note: config.note,
    keyHint: config.keyHint,
    docsUrl: config.docsUrl,
  };

  return {
    info,
    async complete(request, context: ProviderContext): Promise<CompletionResult> {
      if (!context.apiKey) {
        throw new ProviderFailure(
          `${config.label} API anahtarı ayarlanmamış. Ayarlar → Sağlayıcı bölümünden anahtar ekleyin.`,
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
          model: request.model || config.defaultModel,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
        };
        if (request.maxTokens) body.max_tokens = request.maxTokens;
        if (request.jsonMode && config.jsonMode !== false) {
          body.response_format = { type: 'json_object' };
        }

        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${context.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          let detail = '';
          try {
            const parsed = (await response.json()) as ChatResponse;
            detail = parsed.error?.message ?? '';
          } catch {
            detail = '';
          }
          throw new ProviderFailure(
            errorMessage(config.label, response.status, detail),
            'http-error',
            response.status,
          );
        }

        const data = (await response.json()) as ChatResponse;
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
          model: request.model || config.defaultModel,
          provider: config.id,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (error instanceof ProviderFailure) throw error;
        if (controller.signal.aborted) {
          throw new ProviderFailure(
            context.signal.aborted
              ? 'İstek kullanıcı tarafından durduruldu.'
              : 'İstek zaman aşımına uğradı (120 sn).',
            context.signal.aborted ? 'aborted' : 'timeout',
          );
        }
        // Ağ hatalarında istek başlıkları/anahtar asla mesaja eklenmez.
        throw new ProviderFailure(
          `${config.label} bağlantısı kurulamadı. İnternet bağlantısını kontrol edin.`,
          'network',
        );
      } finally {
        clearTimeout(timeout);
        context.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}

import type { CompletionResult, ProviderInfo } from '../../../src/shared/types';
import { estimateTokens } from '../../../src/shared/tokens';
import { fetchWithRetry, retryAfterSeconds } from './http';
import { ProviderFailure, type ProviderAdapter, type ProviderContext } from './types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 120_000;

const info: ProviderInfo = {
  id: 'anthropic',
  label: 'Claude',
  requiresApiKey: true,
  models: [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tag: 'dengeli' },
    { id: 'claude-fable-5-2', label: 'Claude Fable 5.2', tag: 'en yeni' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tag: 'en güçlü' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tag: 'hızlı' },
  ],
  defaultModel: 'claude-sonnet-5-5',
  note: 'Anthropic Messages API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'sk-ant-…',
  docsUrl: 'https://console.anthropic.com/settings/keys',
};

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: AnthropicUsage;
  error?: { message?: string; type?: string };
}

function errorMessage(status: number, detail: string, retryAfter: number | null = null): string {
  switch (status) {
    case 401:
      return 'Anthropic API anahtarı geçersiz veya süresi dolmuş. Ayarlardan anahtarı yenileyin.';
    case 403:
      return 'Bu anahtarın seçilen Claude modeli için erişim yetkisi yok.';
    case 404:
      return 'Seçilen Claude modeli bulunamadı. Ayarlardan geçerli bir model kimliği seçin.';
    case 402:
    case 429:
      if (/credit balance is too low|credit_balance_exhausted|billing/i.test(detail)) {
        return 'Claude kullanım kotası doldu: hesapta kullanılabilir kredi yok. Anthropic panelinizden kredi ekleyin veya faturalandırmayı kontrol edin.';
      }
      return `Anthropic istek sınırı aşıldı.${
        retryAfter ? ` Yaklaşık ${retryAfter} saniye sonra` : ' Kısa bir süre sonra'
      } tekrar deneyin.`;
    case 500:
    case 502:
    case 503:
    case 529:
      return 'Anthropic hizmetinde geçici bir hata oluştu. Birazdan tekrar deneyin.';
    default:
      return detail
        ? `Anthropic isteği başarısız (HTTP ${status}): ${detail.slice(0, 300)}`
        : `Anthropic isteği başarısız (HTTP ${status}).`;
  }
}

export const anthropicProvider: ProviderAdapter = {
  info,
  async complete(request, context: ProviderContext): Promise<CompletionResult> {
    if (!context.apiKey) {
      throw new ProviderFailure(
        context.hasStoredKey
          ? 'Claude anahtarı kayıtlı görünüyor ama işletim sistemi kasasından okunamadı. Ayarlar → Sağlayıcı bölümünden anahtarı yeniden kaydedin.'
          : 'Claude API anahtarı ayarlanmamış. Ayarlar → Sağlayıcı bölümünden anahtar ekleyin.',
        'missing-key',
      );
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    context.signal.addEventListener('abort', onAbort);

    try {
      // Anthropic sistem iletisini ayrı alır; rolü 'system' olanları birleştiririz.
      const system = request.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
      const messages = request.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        }));

      const body: Record<string, unknown> = {
        model: request.model || info.defaultModel,
        max_tokens: request.maxTokens ?? 2048,
        temperature: request.temperature ?? 0.2,
        messages,
      };
      if (system) body.system = system;

      const response = await fetchWithRetry(
        ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': context.apiKey,
            'anthropic-version': API_VERSION,
          },
          body: JSON.stringify(body),
        },
        controller.signal,
      );

      if (!response.ok) {
        let detail = '';
        try {
          const parsed = (await response.json()) as AnthropicResponse;
          detail = parsed.error?.message ?? '';
        } catch {
          detail = '';
        }
        throw new ProviderFailure(
          errorMessage(response.status, detail, retryAfterSeconds(response)),
          'http-error',
          response.status,
        );
      }

      const data = (await response.json()) as AnthropicResponse;
      const text = (data.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      const promptText = request.messages.map((message) => message.content).join('\n');
      const usage = data.usage;
      const measured = typeof usage?.input_tokens === 'number';
      const promptTokens = usage?.input_tokens ?? estimateTokens(promptText);
      const completionTokens = usage?.output_tokens ?? estimateTokens(text);

      return {
        requestId: request.requestId,
        text,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          estimated: !measured,
        },
        model: request.model || info.defaultModel,
        provider: 'anthropic',
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
      throw new ProviderFailure(
        'Anthropic bağlantısı kurulamadı. İnternet bağlantısını kontrol edin.',
        'network',
      );
    } finally {
      clearTimeout(timeout);
      context.signal.removeEventListener('abort', onAbort);
    }
  },
};

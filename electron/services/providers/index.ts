import type { ProviderId, ProviderInfo, ProviderStatus } from '../../../src/shared/types';
import { anthropicProvider } from './anthropic';
import { deepseekProvider } from './deepseek';
import { geminiProvider } from './gemini';
import { groqProvider } from './groq';
import { grokProvider } from './grok';
import { mistralProvider } from './mistral';
import { ollamaProvider } from './ollama';
import { openaiProvider } from './openai';
import { openrouterProvider } from './openrouter';
import type { ProviderAdapter } from './types';
import { encryptionAvailable, hasApiKey, keyStorageLabel } from '../secrets';

/** Sağlayıcı kayıt defteri: yeni adaptör eklemek için yalnızca bu listeye ekleyin. */
const adapters: Record<ProviderId, ProviderAdapter> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  deepseek: deepseekProvider,
  grok: grokProvider,
  mistral: mistralProvider,
  groq: groqProvider,
  openrouter: openrouterProvider,
  ollama: ollamaProvider,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return adapters[provider] ?? openaiProvider;
}

export function providerInfos(): ProviderInfo[] {
  return Object.values(adapters).map((adapter) => adapter.info);
}

export function providerStatus(): ProviderStatus {
  const apiKeys: ProviderStatus['apiKeys'] = {};
  for (const id of Object.keys(adapters) as ProviderId[]) {
    apiKeys[id] = hasApiKey(id);
  }
  return {
    providers: providerInfos(),
    apiKeys,
    encryptionAvailable: encryptionAvailable(),
    keyStorage: keyStorageLabel(),
  };
}

export type { ProviderAdapter } from './types';
export { ProviderFailure } from './types';

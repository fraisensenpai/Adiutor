import type { ProviderId, ProviderInfo, ProviderStatus } from '../../../src/shared/types';
import { anthropicProvider } from './anthropic';
import { deepseekProvider } from './deepseek';
import { grokProvider } from './grok';
import { openaiProvider } from './openai';
import type { ProviderAdapter } from './types';
import { encryptionAvailable, hasApiKey, keyStorageLabel } from '../secrets';

/** Sağlayıcı kayıt defteri: yeni adaptör eklemek için yalnızca bu listeye ekleyin. */
const adapters: Record<ProviderId, ProviderAdapter> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  deepseek: deepseekProvider,
  grok: grokProvider,
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

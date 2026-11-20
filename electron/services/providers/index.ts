import type { ProviderId, ProviderInfo, ProviderStatus } from '../../../src/shared/types';
import { demoProvider } from './demo';
import { openaiProvider } from './openai';
import type { ProviderAdapter } from './types';
import { encryptionAvailable, hasApiKey, keyStorageLabel } from '../secrets';

/** Sağlayıcı kayıt defteri: yeni adaptör eklemek için yalnızca bu listeye ekleyin. */
const adapters: Record<string, ProviderAdapter> = {
  demo: demoProvider,
  openai: openaiProvider,
};

export function getAdapter(provider: ProviderId): ProviderAdapter {
  return adapters[provider] ?? demoProvider;
}

export function providerInfos(): ProviderInfo[] {
  return Object.values(adapters).map((adapter) => adapter.info);
}

export function providerStatus(): ProviderStatus {
  return {
    providers: providerInfos(),
    hasApiKey: hasApiKey('openai'),
    encryptionAvailable: encryptionAvailable(),
    keyStorage: keyStorageLabel(),
  };
}

export type { ProviderAdapter } from './types';
export { ProviderFailure } from './types';

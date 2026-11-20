import type { AppSettings, ProviderId } from './types';

export const PROVIDER_IDS: ProviderId[] = ['openai', 'anthropic', 'deepseek', 'grok'];

export const DEFAULT_MODEL = 'gpt-4.1-mini';

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  model: DEFAULT_MODEL,
  agents: {
    planner: { model: DEFAULT_MODEL, enabled: true },
    coder: { model: DEFAULT_MODEL, enabled: true },
    reviewer: { model: DEFAULT_MODEL, enabled: true },
  },
  maxContextTokens: 6000,
};

import type { AppSettings, ProviderId, ThemeMode } from './types';

export const PROVIDER_IDS: ProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'grok',
  'mistral',
  'groq',
  'openrouter',
  'ollama',
];

export const DEFAULT_MODEL = 'gpt-6.2-sol';

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);
}

export const THEME_MODES: ThemeMode[] = ['dark', 'light', 'system'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as string[]).includes(value);
}

/**
 * Kullanımdan kaldırılmış model kimlikleri için eşleme.
 * Kayıtlı ayarlar eski bir kimlik taşıyorsa istek 404 ile düşmesin diye
 * okuma sırasında güncel modele taşınır.
 */
export const LEGACY_MODEL_MAP: Record<string, string> = {
  'gpt-4.1-mini': 'gpt-6.2-sol',
  'gpt-4.1': 'gpt-6.2-sol',
  'gpt-4o-mini': 'gpt-6-luna',
  'gpt-4o': 'gpt-6.2-sol',
  'gpt-5': 'gpt-6.2-sol',
  'gpt-5-mini': 'gpt-6-luna',
  'o4-mini': 'gpt-6-luna',
  'claude-sonnet-4-5': 'claude-sonnet-5-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-5-5',
  'claude-haiku-4-5': 'claude-haiku-5-5',
  'claude-opus-4-1': 'claude-opus-5-5',
  'claude-3-7-sonnet-latest': 'claude-sonnet-5-5',
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
  'grok-4': 'grok-4.7',
  'grok-4-fast': 'grok-4.7',
  'grok-3': 'grok-4.5',
  'grok-3-mini': 'grok-4.3',
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
};

export function migrateModel(model: string | undefined): string {
  if (!model) return DEFAULT_MODEL;
  return LEGACY_MODEL_MAP[model] ?? model;
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
  theme: 'system',
};

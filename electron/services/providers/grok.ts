import { createChatCompletionsProvider } from './chatCompletions';

export const grokProvider = createChatCompletionsProvider({
  id: 'grok',
  label: 'Grok',
  endpoint: 'https://api.x.ai/v1/chat/completions',
  models: ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini'],
  defaultModel: 'grok-4',
  note: 'xAI Grok OpenAI uyumlu API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'xai-…',
  docsUrl: 'https://console.x.ai/',
});

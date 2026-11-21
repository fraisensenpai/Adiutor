import { createChatCompletionsProvider } from './chatCompletions';

export const grokProvider = createChatCompletionsProvider({
  id: 'grok',
  label: 'Grok',
  endpoint: 'https://api.x.ai/v1/chat/completions',
  models: [
    { id: 'grok-4.7', label: 'Grok 4.7', tag: 'amiral gemisi' },
    { id: 'grok-4.6', label: 'Grok 4.6', tag: 'eski amiral gemisi' },
    { id: 'grok-4.5', label: 'Grok 4.5', tag: 'dengeli' },
    { id: 'grok-4.3', label: 'Grok 4.3', tag: 'ekonomik' },
  ],
  defaultModel: 'grok-4.7',
  note: 'xAI Grok OpenAI uyumlu API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'xai-…',
  docsUrl: 'https://console.x.ai/',
});

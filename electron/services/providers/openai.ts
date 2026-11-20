import { createChatCompletionsProvider } from './chatCompletions';

export const openaiProvider = createChatCompletionsProvider({
  id: 'openai',
  label: 'OpenAI',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  defaultModel: 'gpt-4.1-mini',
  note: 'Chat Completions API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'sk-…',
  docsUrl: 'https://platform.openai.com/api-keys',
});

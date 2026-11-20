import { createChatCompletionsProvider } from './chatCompletions';

export const deepseekProvider = createChatCompletionsProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  models: ['deepseek-chat', 'deepseek-reasoner'],
  defaultModel: 'deepseek-chat',
  note: 'DeepSeek OpenAI uyumlu API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'sk-…',
  docsUrl: 'https://platform.deepseek.com/api_keys',
});

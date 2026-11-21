import { createChatCompletionsProvider } from './chatCompletions';

export const deepseekProvider = createChatCompletionsProvider({
  id: 'deepseek',
  label: 'DeepSeek',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  models: [
    { id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash', tag: 'varsayılan' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', tag: 'akıl yürütme' },
  ],
  defaultModel: 'deepseek-flash',
  note: 'DeepSeek OpenAI uyumlu API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'sk-…',
  docsUrl: 'https://platform.deepseek.com/api_keys',
});

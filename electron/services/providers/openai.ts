import { createChatCompletionsProvider } from './chatCompletions';

export const openaiProvider = createChatCompletionsProvider({
  id: 'openai',
  label: 'OpenAI',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  models: [
    { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', tag: 'günlük iş' },
    { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', tag: 'amiral gemisi' },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', tag: 'hızlı' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', tag: 'ekonomik' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tag: 'eski ana model' },
    { id: 'gpt-5.6', label: 'GPT-5.6', tag: 'eski sürüm' },
  ],
  defaultModel: 'gpt-6.2-sol',
  note: 'Chat Completions API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'sk-…',
  docsUrl: 'https://platform.openai.com/api-keys',
});

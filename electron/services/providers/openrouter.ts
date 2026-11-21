import { createChatCompletionsProvider } from './chatCompletions';

export const openrouterProvider = createChatCompletionsProvider({
  id: 'openrouter',
  label: 'OpenRouter',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  models: [
    { id: 'openrouter/auto', label: 'Otomatik yönlendirme', tag: 'otomatik' },
    { id: 'openai/gpt-6.2-sol', label: 'GPT-6.2 Sol', tag: 'günlük iş' },
    { id: 'anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tag: 'dengeli' },
    { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', tag: 'hızlı' },
    { id: 'deepseek/deepseek-flash', label: 'DeepSeek Flash', tag: 'ekonomik' },
    { id: 'x-ai/grok-4.7', label: 'Grok 4.7', tag: 'amiral gemisi' },
  ],
  defaultModel: 'openrouter/auto',
  note: 'OpenRouter tek anahtarla birçok modele erişim sağlar. Anahtar güvenli kasada tutulur.',
  keyHint: 'sk-or-…',
  docsUrl: 'https://openrouter.ai/keys',
  jsonMode: false,
  headers: { 'HTTP-Referer': 'https://github.com/fraisensenpai/Adiutor', 'X-Title': 'Adiutor' },
});

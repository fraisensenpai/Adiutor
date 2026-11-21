import { createChatCompletionsProvider } from './chatCompletions';

export const groqProvider = createChatCompletionsProvider({
  id: 'groq',
  label: 'Groq',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  models: [
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tag: 'güçlü' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', tag: 'çok hızlı' },
    { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', tag: 'dengeli' },
    { id: 'moonshotai/kimi-k2-instruct-0905', label: 'Kimi K2 Instruct', tag: 'kod' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tag: 'kurumsal' },
  ],
  defaultModel: 'openai/gpt-oss-120b',
  note: 'GroqCloud OpenAI uyumlu API. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'gsk_…',
  docsUrl: 'https://console.groq.com/keys',
});

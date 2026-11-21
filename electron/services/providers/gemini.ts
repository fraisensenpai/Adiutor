import { createChatCompletionsProvider } from './chatCompletions';

export const geminiProvider = createChatCompletionsProvider({
  id: 'gemini',
  label: 'Gemini',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  models: [
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon', tag: 'amiral gemisi' },
    { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', tag: 'en yeni' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', tag: 'hızlı' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tag: 'ekonomik' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tag: 'eski sürüm' },
  ],
  defaultModel: 'gemini-4-argon',
  note: 'Gemini OpenAI uyumlu uç noktası. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'AIza…',
  docsUrl: 'https://aistudio.google.com/apikey',
  jsonMode: false,
});

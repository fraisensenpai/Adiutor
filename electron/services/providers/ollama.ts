import { createChatCompletionsProvider } from './chatCompletions';

export const ollamaProvider = createChatCompletionsProvider({
  id: 'ollama',
  label: 'Ollama',
  endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
  models: [
    { id: 'qwen2.5-coder:7b', label: 'Qwen2.5 Coder 7B', tag: 'kod · yerel' },
    { id: 'llama3.2', label: 'Llama 3.2', tag: 'yerel' },
    { id: 'deepseek-r1:8b', label: 'DeepSeek R1 8B', tag: 'akıl yürütme · yerel' },
    { id: 'mistral', label: 'Mistral 7B', tag: 'hafif' },
  ],
  defaultModel: 'qwen2.5-coder:7b',
  note: 'Yerel Ollama sunucusu. Anahtar gerekmez; `ollama serve` çalışıyor olmalı. İstekler makinenizden çıkmaz.',
  keyHint: '',
  docsUrl: 'https://ollama.com/library',
  requiresApiKey: false,
  jsonMode: false,
});

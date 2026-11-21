import { createChatCompletionsProvider } from './chatCompletions';

export const mistralProvider = createChatCompletionsProvider({
  id: 'mistral',
  label: 'Mistral',
  endpoint: 'https://api.mistral.ai/v1/chat/completions',
  models: [
    { id: 'mistral-large-latest', label: 'Mistral Large', tag: 'amiral gemisi' },
    { id: 'mistral-medium-latest', label: 'Mistral Medium', tag: 'dengeli' },
    { id: 'mistral-small-latest', label: 'Mistral Small', tag: 'hızlı' },
    { id: 'codestral-latest', label: 'Codestral', tag: 'kod' },
    { id: 'magistral-medium-latest', label: 'Magistral Medium', tag: 'akıl yürütme' },
  ],
  defaultModel: 'mistral-large-latest',
  note: 'Mistral La Plateforme. Anahtar işletim sisteminin güvenli kasasında tutulur.',
  keyHint: 'anahtar',
  docsUrl: 'https://console.mistral.ai/api-keys',
});

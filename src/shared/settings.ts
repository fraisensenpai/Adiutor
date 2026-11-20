import type { AppSettings } from './types';

export const DEMO_MODEL = 'demo-planner';

export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'demo',
  model: DEMO_MODEL,
  agents: {
    planner: { model: DEMO_MODEL, enabled: true },
    coder: { model: DEMO_MODEL, enabled: true },
    reviewer: { model: DEMO_MODEL, enabled: true },
  },
  maxContextTokens: 6000,
};

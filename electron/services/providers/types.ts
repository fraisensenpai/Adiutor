import type { CompletionRequest, CompletionResult, ProviderInfo } from '../../../src/shared/types';

export interface ProviderContext {
  apiKey: string | null;
  /** Anahtar diskte kayıtlı ama kasadan çözülemediyse true. */
  hasStoredKey: boolean;
  signal: AbortSignal;
}

export interface ProviderAdapter {
  info: ProviderInfo;
  complete(request: CompletionRequest, context: ProviderContext): Promise<CompletionResult>;
}

export class ProviderFailure extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'ProviderFailure';
    this.code = code;
    this.status = status;
  }
}

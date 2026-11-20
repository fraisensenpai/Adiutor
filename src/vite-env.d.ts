/// <reference types="vite/client" />

import type { AdiutorApi } from '@shared/api';

declare global {
  interface Window {
    adiutor: AdiutorApi;
  }
}

export {};

import type { AdiutorApi } from '@shared/api';

/**
 * Electron preload köprüsü. Uygulama yalnızca Electron içinde çalışır;
 * tarayıcıda açılırsa burada anlaşılır bir hata oluşur.
 */
export const bridge: AdiutorApi = window.adiutor;

export function bridgeAvailable(): boolean {
  return Boolean(window.adiutor);
}

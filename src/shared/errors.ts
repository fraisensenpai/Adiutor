/**
 * Electron, ana süreçte fırlatılan hatayı renderer'a
 * "Error invoking remote method 'kanal': Error: …" biçiminde ulaştırır.
 * Bu yardımcı, taşıma katmanına ait sarmalayıcıyı kullanıcıya gösterilen
 * metinden ayıklar.
 */

const INVOKE_PREFIX = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/;

export function stripInvokePrefix(message: string): string {
  return message.replace(INVOKE_PREFIX, '').trim();
}

export function cleanErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return stripInvokePrefix(raw) || fallback;
}

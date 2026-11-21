/**
 * Hata metinlerini kullanıcıya gösterilecek hâle getirir.
 *
 * Electron, ana süreçte fırlatılan hatayı renderer'a
 * "Error invoking remote method 'kanal': Error: …" biçiminde ulaştırır. Preload
 * bu sarmalayıcıyı zaten temizler; burada aynı temizlik, farklı bir yoldan
 * gelen metinler için de uygulanır.
 */

const INVOKE_PREFIX = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/;

export function stripInvokePrefix(message: string): string {
  return message.replace(INVOKE_PREFIX, '').trim();
}

export function cleanErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return stripInvokePrefix(raw) || fallback;
}

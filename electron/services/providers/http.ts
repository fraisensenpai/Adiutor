/**
 * Sağlayıcı istekleri için ortak HTTP yardımcıları.
 *
 * Geçici hatalar (istek sınırı, servis tarafı hatalar) kullanıcıya hata olarak
 * düşmeden önce sınırlı sayıda ve `Retry-After` başlığına uyarak yeniden denenir.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_500;
const MAX_DELAY_MS = 20_000;

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** `Retry-After` saniye ya da HTTP tarihi olarak gelebilir; saniyeye çevrilir. */
export function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return null;
}

export function attemptDelayMs(response: Response, attempt: number): number {
  const hinted = retryAfterSeconds(response);
  if (hinted !== null) return Math.min(hinted * 1000, MAX_DELAY_MS);
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

/** İptal sinyaline saygı duyan bekleme. */
export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    function onAbort() {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Kota bittiğinde yeniden denemek işe yaramaz; gövdedeki kodu kontrol eder. */
async function quotaExhausted(response: Response): Promise<boolean> {
  try {
    const body = await response.clone().text();
    return /insufficient_quota|billing_hard_limit|credit balance is too low/i.test(body);
  } catch {
    return false;
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, { ...init, signal });
    if (response.ok || !isRetryableStatus(response.status) || attempt >= MAX_ATTEMPTS - 1) {
      return response;
    }
    if (await quotaExhausted(response)) return response;
    await waitFor(attemptDelayMs(response, attempt), signal);
  }
}

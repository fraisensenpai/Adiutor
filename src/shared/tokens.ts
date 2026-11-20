/** Kaba token tahmini (~4 karakter / token). Gerçek kullanım sağlayıcıdan gelir. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} bin`;
  return `${(value / 1_000_000).toFixed(2)} Mn`;
}

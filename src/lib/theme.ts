import { useEffect, useState } from 'react';
import type { ThemeMode } from '@shared/types';

export type ResolvedTheme = 'dark' | 'light';

const QUERY = '(prefers-color-scheme: light)';

/** İşletim sistemi temasını izler. */
export function useSystemTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia(QUERY).matches ? 'light' : 'dark',
  );

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const listener = () => setTheme(query.matches ? 'light' : 'dark');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return theme;
}

export function resolveTheme(mode: ThemeMode, system: ResolvedTheme): ResolvedTheme {
  return mode === 'system' ? system : mode;
}

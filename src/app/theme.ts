import { useEffect } from 'react';
import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'keel:theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' || v === 'light' ? v : 'light';
  } catch {
    return 'light';
  }
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeState {
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable: keep in memory only */
    }
    set({ pref });
  },
}));

/** Keeps <html data-theme> in sync with the preference (and the OS when pref = system). */
export function useApplyTheme() {
  const pref = useTheme((s) => s.pref);
  useEffect(() => {
    const apply = () => document.documentElement.setAttribute('data-theme', resolve(pref));
    apply();
    if (pref !== 'system' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}

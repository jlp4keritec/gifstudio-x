'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { THEME_NAMES, type ThemeName } from '@gifstudio-x/shared';
import { themes } from '@/theme';

const STORAGE_KEY = 'gifstudio-theme';
const DEFAULT_THEME: ThemeName = 'dark';

interface ThemeContextValue {
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState<ThemeName>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored && THEME_NAMES.includes(stored as ThemeName)) {
      setThemeNameState(stored as ThemeName);
    }
    setMounted(true);
  }, []);

  const setThemeName = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, name);
    }
  }, []);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_NAMES.indexOf(themeName);
    const nextIndex = (currentIndex + 1) % THEME_NAMES.length;
    setThemeName(THEME_NAMES[nextIndex]);
  }, [themeName, setThemeName]);

  const value = useMemo(
    () => ({ themeName, setThemeName, cycleTheme }),
    [themeName, setThemeName, cycleTheme],
  );

  const theme = themes[themeName];

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
}

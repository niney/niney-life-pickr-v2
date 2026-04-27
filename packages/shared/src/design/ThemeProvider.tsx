import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { lightTheme, type Theme, themes } from './theme.js';

const ThemeContext = createContext<Theme>(lightTheme);

export interface ThemeProviderProps {
  mode?: 'light' | 'dark';
  theme?: Theme;
  children: ReactNode;
}

export const ThemeProvider = ({ mode = 'light', theme, children }: ThemeProviderProps) => {
  const value = useMemo(() => theme ?? themes[mode], [theme, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Theme => useContext(ThemeContext);

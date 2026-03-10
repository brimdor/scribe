import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSetting, setSetting } from '../services/storage';

const ThemeContext = createContext(null);

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  // Check explicit light mode preference, otherwise default to dark mode
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getSystemTheme());
  const [isManual, setIsManual] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    getSetting('theme').then(saved => {
      if (saved) {
        setThemeState(saved);
        setIsManual(true);
      }
    });
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for OS theme changes (if not manually set)
  useEffect(() => {
    if (isManual) return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setThemeState(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [isManual]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(newTheme);
    setIsManual(true);
    setSetting('theme', newTheme);
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    if (nextTheme === 'system') {
      setIsManual(false);
      setThemeState(getSystemTheme());
      setSetting('theme', null);
      return;
    }

    setThemeState(nextTheme);
    setIsManual(true);
    setSetting('theme', nextTheme);
  }, []);

  const resetToSystem = useCallback(() => {
    setIsManual(false);
    setThemeState(getSystemTheme());
    setSetting('theme', null);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, resetToSystem, setTheme, isManual }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

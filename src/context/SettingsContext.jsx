import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_APP_SETTINGS, getAppSettings, saveAppSettings } from '../services/storage';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    getAppSettings()
      .then((storedSettings) => {
        if (mounted) {
          setSettings(storedSettings);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const persistSettings = useCallback(async (nextSettings) => {
    const savedSettings = await saveAppSettings(nextSettings);
    setSettings(savedSettings);
    return savedSettings;
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const value = useMemo(() => ({
    settings,
    loading,
    isSettingsOpen,
    openSettings,
    closeSettings,
    saveSettings: persistSettings,
  }), [settings, loading, isSettingsOpen, openSettings, closeSettings, persistSettings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

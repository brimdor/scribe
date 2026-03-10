import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearOpenAIOAuthPendingFlow,
  clearOpenAIOAuthSession,
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  getOpenAIOAuthPendingFlow,
  getOpenAIOAuthSession,
  saveAppSettings,
  saveOpenAIOAuthPendingFlow,
  saveOpenAIOAuthSession,
} from '../services/storage';
import {
  completeOpenAIOAuthCallback,
  createOpenAIDeviceFlow,
  fetchOpenAIModels,
  isOpenAIOAuthCallback,
  pollOpenAIDeviceFlow,
} from '../services/openai-oauth';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openAIOAuthSession, setOpenAIOAuthSession] = useState(null);
  const [openAIOAuthPendingFlow, setOpenAIOAuthPendingFlow] = useState(null);
  const [openAIOAuthMessage, setOpenAIOAuthMessage] = useState('');
  const [callbackInProgress, setCallbackInProgress] = useState(false);
  const [oauthBusy, setOAuthBusy] = useState(false);
  const [agentModels, setAgentModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const settingsRef = useRef(DEFAULT_APP_SETTINGS);
  const devicePollingRef = useRef(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let mounted = true;

    if (!isAuthenticated) {
      setSettings(DEFAULT_APP_SETTINGS);
      setOpenAIOAuthSession(null);
      setOpenAIOAuthPendingFlow(null);
      setOpenAIOAuthMessage('');
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);

    Promise.all([
      getAppSettings(),
      getOpenAIOAuthSession(),
      getOpenAIOAuthPendingFlow(),
    ])
      .then(([storedSettings, storedSession, storedPendingFlow]) => {
        if (!mounted) {
          return;
        }

        setSettings(storedSettings);
        setOpenAIOAuthSession(storedSession);
        setOpenAIOAuthPendingFlow(storedPendingFlow);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const handleSessionUpdate = async (event) => {
      const nextSession = event.detail?.session || null;
      const saved = await saveOpenAIOAuthSession(nextSession);
      setOpenAIOAuthSession(saved);
    };

    window.addEventListener('scribe:openai-oauth-session', handleSessionUpdate);
    return () => window.removeEventListener('scribe:openai-oauth-session', handleSessionUpdate);
  }, []);

  const persistSettings = useCallback(async (nextSettings) => {
    const savedSettings = await saveAppSettings(nextSettings);
    setSettings(savedSettings);
    return savedSettings;
  }, []);

  useEffect(() => {
    if (!openAIOAuthPendingFlow || openAIOAuthPendingFlow.type !== 'device') {
      devicePollingRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    const finishPendingFlow = async (message, nextSession = null) => {
      let savedSession = null;
      let savedSettings = null;

      if (nextSession) {
        savedSession = await saveOpenAIOAuthSession(nextSession);
        savedSettings = await persistSettings({
          ...settingsRef.current,
          openaiConnectionMethod: 'oauth',
        });
      }

      await clearOpenAIOAuthPendingFlow();

      if (cancelled) {
        return;
      }

      setOpenAIOAuthPendingFlow(null);
      setOpenAIOAuthMessage(message);

      if (savedSession) {
        setSettings(savedSettings);
        setOpenAIOAuthSession(savedSession);
      }
    };

    const poll = async () => {
      if (devicePollingRef.current || cancelled) {
        return;
      }

      devicePollingRef.current = true;

      try {
        const result = await pollOpenAIDeviceFlow(openAIOAuthPendingFlow);

        if (cancelled) {
          return;
        }

        if (result.status === 'pending') {
          timeoutId = window.setTimeout(() => {
            devicePollingRef.current = false;
            poll();
          }, openAIOAuthPendingFlow.intervalMs || 5000);
          return;
        }

        await finishPendingFlow('OpenAI connected. You can now use Scribe without a manual OpenAI API key.', result.session);
      } catch (error) {
        if (!cancelled) {
          await finishPendingFlow(error.message || 'OpenAI sign-in could not be completed.');
        }
      } finally {
        if (!timeoutId) {
          devicePollingRef.current = false;
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      devicePollingRef.current = false;
    };
  }, [openAIOAuthPendingFlow, persistSettings]);

  useEffect(() => {
    if (settings.openaiConnectionMethod !== 'oauth' || !openAIOAuthSession || openAIOAuthSession.status !== 'connected') {
      setAgentModels([]);
      setFetchingModels(false);
      return undefined;
    }

    const controller = new AbortController();
    
    const loadModels = async () => {
      setFetchingModels(true);
      try {
        const models = await fetchOpenAIModels({
          session: openAIOAuthSession,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setAgentModels(models);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch OpenAI models:', error);
          setAgentModels([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setFetchingModels(false);
        }
      }
    };

    loadModels();

    return () => {
      controller.abort();
    };
  }, [openAIOAuthSession, settings.openaiConnectionMethod]);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const connectOpenAI = useCallback(async () => {
    setOAuthBusy(true);
    setOpenAIOAuthMessage('Opening OpenAI sign-in...');

    const authWindow = typeof window.open === 'function'
      ? window.open('', 'scribe-openai-oauth', 'popup,width=520,height=720')
      : null;

    try {
      const { verificationUrl, pendingFlow } = await createOpenAIDeviceFlow({
        returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      });

      const savedPendingFlow = await saveOpenAIOAuthPendingFlow(pendingFlow);
      setOpenAIOAuthPendingFlow(savedPendingFlow);
      setOpenAIOAuthMessage('Finish the OpenAI sign-in in your browser. Scribe will connect automatically once you approve it.');

      if (authWindow && !authWindow.closed) {
        authWindow.location.href = verificationUrl;
        authWindow.focus();
      } else {
        window.open(verificationUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      authWindow?.close();
      setOpenAIOAuthMessage(error.message || 'Unable to start OpenAI sign-in.');
    } finally {
      setOAuthBusy(false);
    }
  }, []);

  const disconnectOpenAI = useCallback(async () => {
    setOAuthBusy(true);
    const wasConnecting = !!openAIOAuthPendingFlow;
    await Promise.all([
      clearOpenAIOAuthSession(),
      clearOpenAIOAuthPendingFlow(),
    ]);
    const savedSettings = await persistSettings({
      ...settings,
      openaiConnectionMethod: 'manual',
    });

    setSettings(savedSettings);
    setOpenAIOAuthSession(null);
    setOpenAIOAuthPendingFlow(null);
    setOpenAIOAuthMessage(wasConnecting ? 'OpenAI sign-in canceled.' : 'OpenAI sign-in disconnected.');
    setOAuthBusy(false);
  }, [openAIOAuthPendingFlow, persistSettings, settings]);

  const completeOpenAICallback = useCallback(async () => {
    if (!isOpenAIOAuthCallback(window.location.search)) {
      return false;
    }

    setCallbackInProgress(true);
    setOAuthBusy(true);

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const code = params.get('code');
    const state = params.get('state');
    const pendingFlow = openAIOAuthPendingFlow || await getOpenAIOAuthPendingFlow();

    if (pendingFlow?.type === 'device') {
      setCallbackInProgress(false);
      setOAuthBusy(false);
      return false;
    }

    const fallbackReturnPath = pendingFlow?.returnPath || '/';

    const finish = async (message, shouldOpenSettings = true) => {
      await clearOpenAIOAuthPendingFlow();
      setOpenAIOAuthPendingFlow(null);
      setOpenAIOAuthMessage(message);
      if (shouldOpenSettings) {
        setIsSettingsOpen(true);
      }
      window.history.replaceState({}, document.title, fallbackReturnPath);
      setCallbackInProgress(false);
      setOAuthBusy(false);
      return true;
    };

    if (error) {
      return finish(errorDescription || 'OpenAI sign-in was canceled or rejected.');
    }

    try {
      const session = await completeOpenAIOAuthCallback({
        code,
        state,
        pendingFlow,
        redirectUri: window.location.origin,
      });

      const savedSession = await saveOpenAIOAuthSession(session);
      const savedSettings = await persistSettings({
        ...settings,
        openaiConnectionMethod: 'oauth',
      });

      setSettings(savedSettings);
      setOpenAIOAuthSession(savedSession);
      return finish('OpenAI connected. You can now use Scribe without a manual OpenAI API key.');
    } catch (callbackError) {
      return finish(callbackError.message || 'OpenAI sign-in could not be completed.');
    }
  }, [openAIOAuthPendingFlow, persistSettings, settings]);

  const value = useMemo(() => ({
    settings,
    loading,
    isSettingsOpen,
    openSettings,
    closeSettings,
    saveSettings: persistSettings,
    openAIOAuthSession,
    openAIOAuthPendingFlow,
    openAIOAuthMessage,
    openAIOAuthStatus: openAIOAuthSession?.status || (openAIOAuthPendingFlow ? 'connecting' : 'disconnected'),
    callbackInProgress,
    oauthBusy,
    agentModels,
    fetchingModels,
    connectOpenAI,
    disconnectOpenAI,
    completeOpenAICallback,
    clearOpenAIMessage: () => setOpenAIOAuthMessage(''),
  }), [
    settings,
    loading,
    isSettingsOpen,
    openSettings,
    closeSettings,
    persistSettings,
    openAIOAuthSession,
    openAIOAuthPendingFlow,
    openAIOAuthMessage,
    callbackInProgress,
    oauthBusy,
    agentModels,
    fetchingModels,
    connectOpenAI,
    disconnectOpenAI,
    completeOpenAICallback,
  ]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}

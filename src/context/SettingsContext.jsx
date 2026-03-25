import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_APP_SETTINGS,
  saveBootstrapData,
} from '../services/storage';
import {
  completeOpenAIOAuthCallback,
  createOpenAIDeviceFlow,
  fetchOpenAIModels,
  isOpenAIOAuthCallback,
  pollOpenAIDeviceFlow,
} from '../services/openai-oauth';
import {
  executeHeartbeat,
  getHeartbeatState,
  setHeartbeatStateListener,
  startHeartbeatScheduler,
  stopHeartbeatScheduler,
} from '../services/heartbeat';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { bootstrap, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHeartbeatPanelOpen, setIsHeartbeatPanelOpen] = useState(false);
  const [openAIOAuthSession, setOpenAIOAuthSession] = useState(null);
  const [openAIOAuthPendingFlow, setOpenAIOAuthPendingFlow] = useState(null);
  const [openAIOAuthMessage, setOpenAIOAuthMessage] = useState('');
  const [callbackInProgress, setCallbackInProgress] = useState(false);
  const [oauthBusy, setOAuthBusy] = useState(false);
  const [agentModels, setAgentModels] = useState([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState(getHeartbeatState());
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

    if (mounted) {
      setSettings(bootstrap?.settings || DEFAULT_APP_SETTINGS);
      setOpenAIOAuthSession(bootstrap?.openAIOAuthSession || null);
      setOpenAIOAuthPendingFlow(bootstrap?.openAIOAuthPendingFlow || null);
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [bootstrap, isAuthenticated]);

  useEffect(() => {
    const handleSessionUpdate = async (event) => {
      const nextSession = event.detail?.session || null;
      const payload = await saveBootstrapData({ openAIOAuthSession: nextSession });
      setOpenAIOAuthSession(payload.openAIOAuthSession);
    };

    window.addEventListener('scribe:openai-oauth-session', handleSessionUpdate);
    return () => window.removeEventListener('scribe:openai-oauth-session', handleSessionUpdate);
  }, []);

  // Heartbeat state listener
  useEffect(() => {
    setHeartbeatStateListener((nextState) => {
      setHeartbeatStatus(nextState);
    });

    return () => setHeartbeatStateListener(null);
  }, []);

  // Heartbeat scheduler lifecycle
  useEffect(() => {
    if (!isAuthenticated || loading) {
      return undefined;
    }

    if (settings.heartbeatEnabled) {
      startHeartbeatScheduler(settings.heartbeatIntervalMinutes);
    } else {
      stopHeartbeatScheduler();
    }

    return () => {
      stopHeartbeatScheduler();
    };
  }, [isAuthenticated, loading, settings.heartbeatEnabled, settings.heartbeatIntervalMinutes]);

  const persistSettings = useCallback(async (nextSettings) => {
    const payload = await saveBootstrapData({ settings: nextSettings });
    setSettings(payload.settings);
    return payload.settings;
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
        const payload = await saveBootstrapData({
          openAIOAuthSession: nextSession,
          openAIOAuthPendingFlow: null,
          settings: {
            ...settingsRef.current,
            openaiConnectionMethod: 'oauth',
          },
        });
        savedSession = payload.openAIOAuthSession;
        savedSettings = payload.settings;
      } else {
        await saveBootstrapData({ openAIOAuthPendingFlow: null });
      }

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
  }, [openAIOAuthPendingFlow]);

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
  const openHeartbeatPanel = useCallback(() => setIsHeartbeatPanelOpen(true), []);
  const closeHeartbeatPanel = useCallback(() => setIsHeartbeatPanelOpen(false), []);
  const triggerHeartbeat = useCallback(() => executeHeartbeat(), []);

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

      const payload = await saveBootstrapData({ openAIOAuthPendingFlow: pendingFlow });
      setOpenAIOAuthPendingFlow(payload.openAIOAuthPendingFlow);
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
    const payload = await saveBootstrapData({
      openAIOAuthSession: null,
      openAIOAuthPendingFlow: null,
      settings: {
        ...settings,
        openaiConnectionMethod: 'manual',
      },
    });

    setSettings(payload.settings);
    setOpenAIOAuthSession(null);
    setOpenAIOAuthPendingFlow(null);
    setOpenAIOAuthMessage(wasConnecting ? 'OpenAI sign-in canceled.' : 'OpenAI sign-in disconnected.');
    setOAuthBusy(false);
  }, [openAIOAuthPendingFlow, settings]);

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
    const pendingFlow = openAIOAuthPendingFlow;

    if (pendingFlow?.type === 'device') {
      setCallbackInProgress(false);
      setOAuthBusy(false);
      return false;
    }

    const fallbackReturnPath = pendingFlow?.returnPath || '/';

    const finish = async (message, shouldOpenSettings = true, clearPendingFlow = true) => {
      if (clearPendingFlow) {
        await saveBootstrapData({ openAIOAuthPendingFlow: null });
      }
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

      const payload = await saveBootstrapData({
        openAIOAuthSession: session,
        openAIOAuthPendingFlow: null,
        settings: {
          ...settings,
          openaiConnectionMethod: 'oauth',
        },
      });

      setSettings(payload.settings);
      setOpenAIOAuthSession(payload.openAIOAuthSession);
      return finish('OpenAI connected. You can now use Scribe without a manual OpenAI API key.', true, false);
    } catch (callbackError) {
      return finish(callbackError.message || 'OpenAI sign-in could not be completed.');
    }
  }, [openAIOAuthPendingFlow, settings]);

  const value = useMemo(() => ({
    settings,
    loading,
    isSettingsOpen,
    openSettings,
    closeSettings,
    saveSettings: persistSettings,
    isHeartbeatPanelOpen,
    openHeartbeatPanel,
    closeHeartbeatPanel,
    heartbeatStatus,
    triggerHeartbeat,
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
    isHeartbeatPanelOpen,
    openHeartbeatPanel,
    closeHeartbeatPanel,
    heartbeatStatus,
    triggerHeartbeat,
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

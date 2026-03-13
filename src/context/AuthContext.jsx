import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '../services/api';
import { loginWithGitHub, logoutSession } from '../services/auth';
import { getBootstrapData, saveBootstrapData } from '../services/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [selectedRepo, setSelectedRepoState] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadBootstrap = useCallback(async () => {
    const payload = await getBootstrapData();
    setBootstrap(payload);
    setUser(payload.user);
    setSelectedRepoState(payload.selectedRepo || null);
    return payload;
  }, []);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const payload = await getBootstrapData();
        if (!mounted) {
          return;
        }

        setBootstrap(payload);
        setUser(payload.user);
        setSelectedRepoState(payload.selectedRepo || null);
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (!(error instanceof ApiError && error.status === 401)) {
          console.error('Failed to load auth session:', error);
        }
        setBootstrap(null);
        setUser(null);
        setSelectedRepoState(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    hydrate();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (username, githubToken) => {
    if (!username || !githubToken) {
      throw new Error('Username and token are required');
    }

    const sessionUser = await loginWithGitHub(username, githubToken);
    await loadBootstrap();

    return sessionUser;
  }, [loadBootstrap]);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // Ignore backend logout failures and still clear local state.
    }

    setUser(null);
    setSelectedRepoState(null);
    setBootstrap(null);
  }, []);

  const selectRepo = useCallback(async (repo) => {
    const payload = await saveBootstrapData({ selectedRepo: repo });
    setBootstrap(payload);
    setSelectedRepoState(payload.selectedRepo || null);
  }, []);

  const value = {
    user,
    selectedRepo,
    bootstrap,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    selectRepo,
    refreshBootstrap: loadBootstrap,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError } from '../services/api';
import { getCurrentSession, loginWithGitHub, logoutSession } from '../services/auth';
import { getSetting, setSetting } from '../services/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [selectedRepo, setSelectedRepoState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        const sessionUser = await getCurrentSession();
        if (!mounted) {
          return;
        }

        setUser(sessionUser);
        const repo = await getSetting('selectedRepo');
        if (mounted) {
          setSelectedRepoState(repo || null);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (!(error instanceof ApiError && error.status === 401)) {
          console.error('Failed to load auth session:', error);
        }
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
    setUser(sessionUser);

    const repo = await getSetting('selectedRepo');
    setSelectedRepoState(repo || null);

    return sessionUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // Ignore backend logout failures and still clear local state.
    }

    setUser(null);
    setSelectedRepoState(null);
  }, []);

  const selectRepo = useCallback(async (repo) => {
    setSelectedRepoState(repo);
    await setSetting('selectedRepo', repo);
  }, []);

  const value = {
    user,
    selectedRepo,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    selectRepo,
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

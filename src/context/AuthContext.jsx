import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredToken, storeToken, clearToken, getStoredUser, storeUser } from '../services/auth';
import { initGitHub, getUser } from '../services/github';
import { getSetting, setSetting } from '../services/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [token, setToken] = useState(getStoredToken());
  const [selectedRepo, setSelectedRepoState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load selected repo from IndexedDB on mount
  useEffect(() => {
    getSetting('selectedRepo').then(repo => {
      if (repo) setSelectedRepoState(repo);
      setLoading(false);
    });
  }, []);

  // Initialize GitHub client when token changes
  useEffect(() => {
    if (token) {
      initGitHub(token);
    }
  }, [token]);

  const login = useCallback(async (username, githubToken) => {
    if (!username || !githubToken) {
      throw new Error('Username and token are required');
    }

    storeToken(githubToken);
    setToken(githubToken);
    initGitHub(githubToken);

    try {
      const userData = await getUser();
      
      // Validate that the provided username matches the token's owner
      if (userData.login.toLowerCase() !== username.toLowerCase()) {
        throw new Error('Token does not match the provided username');
      }

      const userInfo = {
        login: userData.login,
        name: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
      };
      storeUser(userInfo);
      setUser(userInfo);
      return userInfo;
    } catch (err) {
      clearToken();
      setToken(null);
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    setSelectedRepoState(null);
  }, []);

  const selectRepo = useCallback(async (repo) => {
    setSelectedRepoState(repo);
    await setSetting('selectedRepo', repo);
  }, []);

  const value = {
    user,
    token,
    selectedRepo,
    loading,
    isAuthenticated: !!token && !!user,
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

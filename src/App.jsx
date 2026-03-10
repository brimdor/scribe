import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './components/Auth/LoginPage';
import Layout from './components/Layout/Layout';

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const { callbackInProgress, completeOpenAICallback } = useSettings();

  useEffect(() => {
    completeOpenAICallback();
  }, [completeOpenAICallback]);

  if (loading || callbackInProgress) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-tertiary)',
        fontSize: '1.125rem',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>✍️</div>
          <div>{callbackInProgress ? 'Finishing OpenAI sign-in...' : 'Loading Scribe...'}</div>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <Layout /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SettingsProvider>
          <AppContent />
        </SettingsProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

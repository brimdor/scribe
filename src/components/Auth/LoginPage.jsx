import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !token.trim()) {
      setError('Please enter both your GitHub Username and Personal Access Token');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(username.trim(), token.trim());
    } catch (err) {
      const message = err?.message || '';
      if (
        message === 'Token does not match the provided username'
        || message.includes('requires read/write repo capability')
      ) {
        setError(message);
      } else {
        setError('Invalid credentials. Please check your username and Personal Access Token.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">✍️</div>
        <h1 className="login-title">Scribe</h1>
        <p className="login-subtitle">
          AI-powered notetaking with GitHub storage<br />
          and Obsidian compatibility
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-input-group">
            <label htmlFor="github-username">GitHub Username</label>
            <input
              id="github-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. mbostock"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-input-group">
            <label htmlFor="github-token">GitHub Personal Access Token</label>
            <input
              id="github-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn-primary login-btn"
            disabled={loading}
          >
            {loading ? (
              'Connecting...'
            ) : (
              <>
                <svg className="btn-icon-svg" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                Connect with GitHub
              </>
            )}
          </button>
        </form>

        <p className="login-help">
          Create a token at{' '}
          <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">
            GitHub Settings → Tokens
          </a>
          {' '}with <strong>repo</strong> scope. After GitHub sign-in, configure your AI provider from <strong>Settings</strong> - including the new OpenAI sign-in flow if you want to avoid pasting an OpenAI API key.
        </p>

        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-icon">🤖</span>
            <span>AI-powered note generation</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">📝</span>
            <span>Obsidian-compatible Markdown</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🔒</span>
            <span>Notes stored in your GitHub repo</span>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🎨</span>
            <span>Beautiful dark & light themes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

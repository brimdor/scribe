import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import './SettingsPanel.css';

export default function SettingsPanel({ isOpen, onClose }) {
  const { user, selectedRepo } = useAuth();
  const {
    settings,
    saveSettings,
    loading,
    openAIOAuthSession,
    openAIOAuthPendingFlow,
    openAIOAuthStatus,
    openAIOAuthMessage,
    oauthBusy,
    agentModels,
    fetchingModels,
    connectOpenAI,
    disconnectOpenAI,
    clearOpenAIMessage,
  } = useSettings();
  const { theme, isManual, setTheme } = useTheme();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const repoLabel = selectedRepo
    ? `${selectedRepo.owner?.login || selectedRepo.owner || 'unknown'}/${selectedRepo.name}`
    : 'Not selected';

  useEffect(() => {
    setForm(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const themeValue = useMemo(() => (isManual ? theme : 'system'), [isManual, theme]);
  const isOAuthConnected = openAIOAuthStatus === 'connected' && !!openAIOAuthSession;
  const isOAuthConnecting = openAIOAuthStatus === 'connecting';
  const devicePendingFlow = openAIOAuthPendingFlow?.type === 'device' ? openAIOAuthPendingFlow : null;
  const messageLooksLikeError = !!openAIOAuthMessage
    && !isOAuthConnected
    && !isOAuthConnecting
    && !oauthBusy
    && !/^OpenAI sign-in (canceled|disconnected)\.?$/i.test(openAIOAuthMessage.trim());
  const connectionTone = error || openAIOAuthStatus === 'error' || messageLooksLikeError
    ? 'error'
    : isOAuthConnecting || oauthBusy
      ? 'info'
      : 'success';
  const connectionLabel = isOAuthConnected
    ? 'Connected'
    : isOAuthConnecting
      ? 'Awaiting approval'
      : openAIOAuthStatus === 'error'
        ? 'Needs attention'
        : 'Disconnected';

  if (!isOpen) {
    return null;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      const updates = { [name]: value };
      if (name === 'openaiConnectionMethod' && value !== current.openaiConnectionMethod) {
        updates.agentModel = '';
      }
      return { ...current, ...updates };
    });
    setError('');
    setStatus('');
    clearOpenAIMessage();
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    setStatus('Appearance updated.');
  };

  const handleConnect = async () => {
    setError('');
    setStatus('');
    await connectOpenAI();
  };

  const handleDisconnect = async () => {
    setError('');
    setStatus('');
    await disconnectOpenAI();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.openaiConnectionMethod !== 'oauth' && !form.agentBaseUrl.trim()) {
      setError('Agent base URL is required for manual provider mode.');
      setStatus('');
      return;
    }

    if (form.openaiConnectionMethod === 'oauth' && !isOAuthConnected) {
      setError('Connect OpenAI before switching Scribe to OpenAI sign-in mode.');
      setStatus('');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await saveSettings(form);
      setStatus('Settings saved.');
    } catch {
      setError('Unable to save settings right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="settings-panel-backdrop" onClick={onClose} />
      <aside className="settings-panel" aria-label="Settings panel" role="dialog" aria-modal="true">
        <div className="settings-panel-header">
          <div>
            <p className="settings-panel-eyebrow">Workspace configuration</p>
            <h2>Settings</h2>
            <p className="settings-panel-subtitle">Customize your environment, GitHub defaults, and AI connection mode.</p>
          </div>
          <button type="button" className="btn-icon settings-panel-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <form className="settings-panel-form" onSubmit={handleSubmit}>
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Environment</span>
              <small>Local workspace preferences</small>
            </div>

            <label className="settings-field">
              <span>Environment name</span>
              <input
                name="environmentName"
                value={form.environmentName}
                onChange={handleChange}
                placeholder="Local development"
              />
            </label>

            <label className="settings-field">
              <span>Theme</span>
              <select value={themeValue} onChange={handleThemeChange}>
                <option value="system">System</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <span>GitHub</span>
              <small>Session and repository defaults</small>
            </div>

            <div className="settings-card">
              <div className="settings-card-row">
                <span>Signed in as</span>
                <strong>{user?.login || 'Not connected'}</strong>
              </div>
              <div className="settings-card-row">
                <span>Selected repository</span>
                <strong>{repoLabel}</strong>
              </div>
            </div>

            <label className="settings-field">
              <span>Default owner or org</span>
              <input
                name="githubOwner"
                value={form.githubOwner}
                onChange={handleChange}
                placeholder="brimdor"
              />
            </label>

            <label className="settings-field">
              <span>Default repository</span>
              <input
                name="githubRepo"
                value={form.githubRepo}
                onChange={handleChange}
                placeholder="scribe-notes"
              />
            </label>
          </section>

          <section className="settings-section settings-section-agent">
            <div className="settings-section-heading">
              <span>OpenAI and compatible providers</span>
              <small>Use OpenAI sign-in or keep the manual endpoint workflow</small>
            </div>

            <label className="settings-field">
              <span>Connection mode</span>
              <select name="openaiConnectionMethod" value={form.openaiConnectionMethod} onChange={handleChange}>
                <option value="oauth">OpenAI sign-in</option>
                <option value="manual">OpenAI API manual connection</option>
              </select>
            </label>

            {form.openaiConnectionMethod === 'oauth' && (
              <div className="settings-card settings-oauth-card">
                <div className="settings-card-row settings-oauth-row">
                  <div>
                    <span>OpenAI sign-in</span>
                    <strong>{connectionLabel}</strong>
                  </div>
                  <div className={`settings-oauth-badge ${connectionTone}`}>
                    {connectionLabel}
                  </div>
                </div>

                <div className="settings-card-row settings-oauth-row">
                  <span>Account</span>
                  <strong>{openAIOAuthSession?.email || 'Not connected'}</strong>
                </div>

                <p className="settings-helper-text">
                  Connect OpenAI once and Scribe can use your OpenAI account without a manually pasted OpenAI API key.
                </p>

                {devicePendingFlow && (
                  <div className="settings-oauth-device-flow">
                    <div className="settings-oauth-device-header">
                      <span>One-time code</span>
                      <a href={devicePendingFlow.verificationUrl} target="_blank" rel="noreferrer">Open OpenAI</a>
                    </div>
                    <div className="settings-oauth-device-code">{devicePendingFlow.userCode}</div>
                    <p className="settings-helper-text">
                      Enter this code at OpenAI, then return here. Scribe will finish connecting automatically.
                    </p>
                  </div>
                )}

                <div className="settings-oauth-actions">
                  <button type="button" className="btn-primary" onClick={handleConnect} disabled={oauthBusy || saving || loading || isOAuthConnecting}>
                    {isOAuthConnecting ? 'Waiting for approval...' : isOAuthConnected ? 'Reconnect OpenAI' : 'Connect OpenAI'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleDisconnect} disabled={(!isOAuthConnected && !isOAuthConnecting) || oauthBusy || saving || loading}>
                    {isOAuthConnecting ? 'Cancel' : 'Disconnect'}
                  </button>
                </div>
              </div>
            )}

            {form.openaiConnectionMethod !== 'oauth' && (
              <>
                <label className="settings-field">
                  <span>Base URL</span>
                  <input
                    name="agentBaseUrl"
                    value={form.agentBaseUrl}
                    onChange={handleChange}
                    placeholder="http://localhost:11434/v1"
                  />
                </label>

                <label className="settings-field">
                  <span>API key</span>
                  <input
                    name="agentApiKey"
                    type="password"
                    value={form.agentApiKey}
                    onChange={handleChange}
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </label>

                <p className="settings-helper-text">
                  Keep manual mode for local or third-party OpenAI-compatible providers. If that provider does not require an API key, Scribe will continue to use <code>1234</code> as the fallback value.
                </p>
              </>
            )}

            <label className="settings-field">
              <span>Model</span>
              {form.openaiConnectionMethod === 'oauth' && isOAuthConnected ? (
                <select 
                  name="agentModel" 
                  value={form.agentModel} 
                  onChange={handleChange}
                  disabled={fetchingModels || !agentModels.length}
                >
                  {fetchingModels ? (
                    <option value="">Loading models...</option>
                  ) : agentModels.length > 0 ? (
                    <>
                      <option value="" disabled>Select a model</option>
                      {agentModels.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </>
                  ) : (
                    <option value="">No models available</option>
                  )}
                </select>
              ) : (
                <input
                  name="agentModel"
                  value={form.agentModel}
                  onChange={handleChange}
                  placeholder={form.openaiConnectionMethod === 'oauth' ? 'Connect OpenAI first' : 'gpt-4o'}
                  disabled={form.openaiConnectionMethod === 'oauth'}
                />
              )}
            </label>
          </section>

          {(error || status || loading || openAIOAuthMessage) && (
            <div className={`settings-status ${error ? 'error' : connectionTone}`}>
              {loading ? 'Loading saved settings...' : error || openAIOAuthMessage || status}
            </div>
          )}

          <div className="settings-panel-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || loading || oauthBusy}>
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

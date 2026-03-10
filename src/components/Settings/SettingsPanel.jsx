import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { getOrgs, getRepos, syncAssignedRepo } from '../../services/github';
import './SettingsPanel.css';

export default function SettingsPanel({ isOpen, onClose }) {
  const { user } = useAuth();
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
  
  const [orgs, setOrgs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [fetchingOrgs, setFetchingOrgs] = useState(false);
  const [fetchingRepos, setFetchingRepos] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState(false);
  const [repoSyncMeta, setRepoSyncMeta] = useState(null);

  useEffect(() => {
    setForm(settings);
  }, [settings, isOpen]);

  useEffect(() => {
    if (isOpen && user) {
      setFetchingOrgs(true);
      getOrgs()
        .then(orgsData => {
          // User's own login + organizations
          setOrgs([{ login: user.login }, ...orgsData]);
        })
        .catch(err => {
          console.error('Failed to fetch orgs', err);
          // Fallback to just user if fetching orgs fails
          setOrgs([{ login: user.login }]);
        })
        .finally(() => setFetchingOrgs(false));
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen && form.githubOwner) {
      setFetchingRepos(true);
      getRepos(form.githubOwner)
        .then(reposData => setRepos(reposData))
        .catch(err => console.error('Failed to fetch repos', err))
        .finally(() => setFetchingRepos(false));
    } else {
      setRepos([]);
    }
  }, [isOpen, form.githubOwner]);

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

  const formatSyncStatus = (sync) => {
    if (!sync) {
      return 'Repository sync skipped.';
    }

    if (sync.status === 'skipped') {
      return sync.message || 'Repository sync skipped.';
    }

    const action = sync.status === 'cloned' ? 'cloned' : 'updated';
    const target = sync.localPath || `${sync.username}/${sync.repo}`;
    return `Repository ${action}: ${target}`;
  };

  const getSyncBadge = (sync) => {
    if (!sync) {
      return { tone: 'info', label: 'Not synced yet' };
    }

    if (sync.status === 'error') {
      return { tone: 'error', label: 'Sync failed' };
    }

    if (sync.status === 'cloned') {
      return { tone: 'success', label: 'Cloned' };
    }

    if (sync.status === 'pulled') {
      return { tone: 'success', label: 'Pulled' };
    }

    if (sync.status === 'skipped') {
      if (sync.syncState === 'up-to-date') {
        return { tone: 'info', label: 'Up to date' };
      }

      if (sync.syncState === 'local-changes') {
        return { tone: 'info', label: 'Skipped: local changes' };
      }

      return { tone: 'info', label: 'Skipped' };
    }

    return { tone: 'info', label: 'Unknown' };
  };

  const syncBadge = getSyncBadge(repoSyncMeta);

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
    setRepoSyncMeta(null);
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

  const handleSyncNow = async () => {
    if (!form.githubOwner?.trim() || !form.githubRepo?.trim()) {
      setError('Select both owner and repository before syncing.');
      setStatus('');
      return;
    }

    setSyncingRepo(true);
    setError('');
    setStatus('Syncing repository...');

    try {
      const sync = await syncAssignedRepo({
        owner: form.githubOwner,
        repo: form.githubRepo,
        reason: 'manual-sync',
      });
      setRepoSyncMeta(sync);
      setStatus(formatSyncStatus(sync));
    } catch (syncError) {
      setRepoSyncMeta({
        status: 'error',
        syncState: 'error',
        message: syncError.message || 'Repository sync failed.',
      });
      setError(syncError.message || 'Repository sync failed.');
      setStatus('');
    } finally {
      setSyncingRepo(false);
    }
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
      const previousOwner = (settings.githubOwner || '').trim();
      const previousRepo = (settings.githubRepo || '').trim();
      const saved = await saveSettings(form);
      const nextOwner = (saved.githubOwner || '').trim();
      const nextRepo = (saved.githubRepo || '').trim();
      const repoChanged = previousOwner !== nextOwner || previousRepo !== nextRepo;

      if (repoChanged && nextOwner && nextRepo) {
        try {
          const sync = await syncAssignedRepo({
            owner: nextOwner,
            repo: nextRepo,
            reason: 'settings-change',
          });
          setRepoSyncMeta(sync);
          setStatus(`Settings saved. ${formatSyncStatus(sync)}`);
        } catch (syncError) {
          setRepoSyncMeta({
            status: 'error',
            syncState: 'error',
            message: syncError.message || 'Unable to sync repository.',
          });
          setStatus(`Settings saved. Repository sync failed: ${syncError.message || 'Unable to sync repository.'}`);
        }
      } else {
        setStatus('Settings saved.');
      }
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

            <div className="settings-card settings-oauth-card">
              <div className="settings-card-row settings-oauth-row">
                <div>
                  <span>GitHub connection</span>
                  <strong>{user ? 'Connected' : 'Not connected'}</strong>
                </div>
                <div className={`settings-oauth-badge ${user ? 'success' : 'error'}`}>
                  {user ? 'Connected' : 'Disconnected'}
                </div>
              </div>
            </div>

            <label className="settings-field">
              <span>Org/Owner</span>
              <select
                name="githubOwner"
                value={form.githubOwner || ''}
                onChange={handleChange}
                disabled={fetchingOrgs || !orgs.length}
              >
                {fetchingOrgs ? (
                  <option value="">Loading...</option>
                ) : (
                  <>
                    <option value="" disabled>Select owner/org</option>
                    {orgs.map((org) => (
                      <option key={org.login} value={org.login}>
                        {org.login}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <label className="settings-field">
              <span>Repository</span>
              <select
                name="githubRepo"
                value={form.githubRepo || ''}
                onChange={handleChange}
                disabled={!form.githubOwner || fetchingRepos || !repos.length}
              >
                {fetchingRepos ? (
                  <option value="">Loading...</option>
                ) : (
                  <>
                    <option value="" disabled>Select repository</option>
                    {repos.map((repo) => (
                      <option key={repo.id} value={repo.name}>
                        {repo.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <div className="settings-sync-actions">
              <button
                type="button"
                className="btn-ghost settings-sync-button"
                onClick={handleSyncNow}
                disabled={saving || loading || syncingRepo || !form.githubOwner || !form.githubRepo}
              >
                {syncingRepo ? 'Syncing...' : 'Sync repository'}
              </button>
              <div className="settings-sync-meta">
                <span className={`settings-oauth-badge settings-sync-badge ${syncBadge.tone}`}>{syncBadge.label}</span>
                <span className="settings-helper-text">
                  {repoSyncMeta?.message || 'Pull latest remote changes when safe; sync skips when local changes are detected.'}
                </span>
              </div>
            </div>
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

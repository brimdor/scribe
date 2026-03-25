import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import { getAgentToolCatalog } from '../../services/agent-tools';
import { getOrgs, getRepos, syncAssignedRepo } from '../../services/github';
import {
  AIProviderSettingsSection,
  EnvironmentSettingsSection,
  GitHubSettingsSection,
} from './SettingsSections';
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
    heartbeatStatus,
    openHeartbeatPanel,
  } = useSettings();
  const { theme, isManual, setTheme } = useTheme();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearAgentApiKey, setClearAgentApiKey] = useState(false);
  
  const [orgs, setOrgs] = useState([]);
  const [repos, setRepos] = useState([]);
  const [fetchingOrgs, setFetchingOrgs] = useState(false);
  const [fetchingRepos, setFetchingRepos] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState(false);
  const [repoSyncMeta, setRepoSyncMeta] = useState(null);

  useEffect(() => {
    setForm(settings);
    setClearAgentApiKey(false);
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
  const toolCatalog = useMemo(() => getAgentToolCatalog(), []);
  const toolGroups = useMemo(() => toolCatalog.reduce((groups, tool) => {
    if (!groups[tool.category]) {
      groups[tool.category] = [];
    }

    groups[tool.category].push(tool);
    return groups;
  }, {}), [toolCatalog]);
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
      return 'Repository refresh skipped.';
    }

    if (sync.status === 'skipped') {
      return sync.message || 'Repository refresh skipped.';
    }

    const action = sync.status === 'cloned' ? 'cloned' : 'refreshed';
    const target = sync.localPath || [sync.username, sync.owner, sync.repo].filter(Boolean).join('/');
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
      if (name === 'agentApiKey') {
        setClearAgentApiKey(false);
      }
      return { ...current, ...updates };
    });
    setError('');
    setStatus('');
    setRepoSyncMeta(null);
    clearOpenAIMessage();
  };

  const handleToggle = (name) => {
    setForm((current) => ({ ...current, [name]: !current[name] }));
    setError('');
    setStatus('');
  };

  const handleNumericChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: Number(value) }));
    setError('');
    setStatus('');
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
      const saved = await saveSettings({
        ...form,
        clearAgentApiKey,
      });
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
      setClearAgentApiKey(false);
      setSaving(false);
    }
  };

  const manualKeyConfigured = Boolean(settings.agentApiKeyConfigured) && !clearAgentApiKey;

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
          <EnvironmentSettingsSection form={form} themeValue={themeValue} onChange={handleChange} onThemeChange={handleThemeChange} />

            <GitHubSettingsSection
              user={user}
              form={form}
              orgs={orgs}
              repos={repos}
              fetchingOrgs={fetchingOrgs}
              fetchingRepos={fetchingRepos}
              syncingRepo={syncingRepo}
              saving={saving}
              loading={loading}
              syncBadge={syncBadge}
              repoSyncMeta={repoSyncMeta}
              onChange={handleChange}
              onSyncNow={handleSyncNow}
            />

            <AIProviderSettingsSection
              form={form}
              settings={settings}
              fetchingModels={fetchingModels}
              agentModels={agentModels}
              toolCatalog={toolCatalog}
              toolGroups={toolGroups}
              clearAgentApiKey={clearAgentApiKey}
              saving={saving}
              loading={loading}
              oauthBusy={oauthBusy}
              isOAuthConnected={isOAuthConnected}
              isOAuthConnecting={isOAuthConnecting}
              connectionLabel={connectionLabel}
              connectionTone={connectionTone}
              openAIOAuthSession={openAIOAuthSession}
              devicePendingFlow={devicePendingFlow}
              manualKeyConfigured={manualKeyConfigured}
              onChange={handleChange}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onToggleClearAgentApiKey={() => setClearAgentApiKey((current) => !current)}
            />

          <section className="settings-section settings-section-heartbeat">
            <div className="settings-section-heading">
              <span>Agent behavior</span>
              <small>Heartbeat scheduling and agent preferences</small>
            </div>

            <div className="settings-card settings-heartbeat-card">
              <div className="settings-card-row settings-toggle-row">
                <div>
                  <span>Heartbeat</span>
                  <small>Periodic autonomous health check</small>
                </div>
                <button
                  type="button"
                  className={`settings-toggle ${form.heartbeatEnabled ? 'active' : ''}`}
                  onClick={() => handleToggle('heartbeatEnabled')}
                  role="switch"
                  aria-checked={form.heartbeatEnabled}
                  aria-label="Toggle heartbeat"
                >
                  <span className="settings-toggle-knob" />
                </button>
              </div>

              {form.heartbeatEnabled && (
                <label className="settings-field">
                  <span>Interval (minutes)</span>
                  <select
                    name="heartbeatIntervalMinutes"
                    value={form.heartbeatIntervalMinutes}
                    onChange={handleNumericChange}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={240}>4 hours</option>
                    <option value={480}>8 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </label>
              )}

              {heartbeatStatus.lastExecution && (
                <div className="settings-card-row">
                  <span>Last heartbeat</span>
                  <strong>
                    {heartbeatStatus.lastExecution.status === 'passed' ? 'Passed' : 'Failed'}
                    {' \u2014 '}
                    {heartbeatStatus.lastExecution.rating}/5
                  </strong>
                </div>
              )}

              <button
                type="button"
                className="btn-ghost settings-heartbeat-history-link"
                onClick={() => { openHeartbeatPanel(); onClose(); }}
              >
                View heartbeat history
              </button>
            </div>

            <label className="settings-field">
              <span>Agent verbosity</span>
              <select name="agentVerbosity" value={form.agentVerbosity} onChange={handleChange}>
                <option value="detailed">Detailed</option>
                <option value="concise">Concise</option>
              </select>
            </label>

            <label className="settings-field">
              <span>Auto-publish</span>
              <select name="agentAutoPublish" value={form.agentAutoPublish} onChange={handleChange}>
                <option value="ask">Ask before publishing</option>
                <option value="auto">Publish automatically</option>
                <option value="never">Never auto-publish</option>
              </select>
            </label>

            <p className="settings-helper-text">
              Verbosity controls how much detail the agent includes in responses. Auto-publish determines whether the agent commits changes to your repository without asking first.
            </p>
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

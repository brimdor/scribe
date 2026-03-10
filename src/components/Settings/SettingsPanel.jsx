import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useTheme } from '../../context/ThemeContext';
import './SettingsPanel.css';

export default function SettingsPanel({ isOpen, onClose }) {
  const { user, selectedRepo } = useAuth();
  const { settings, saveSettings, loading } = useSettings();
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

  if (!isOpen) {
    return null;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError('');
    setStatus('');
  };

  const handleThemeChange = (event) => {
    setTheme(event.target.value);
    setStatus('Appearance updated.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.agentBaseUrl.trim()) {
      setError('Agent base URL is required.');
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
            <p className="settings-panel-subtitle">Customize your environment, GitHub defaults, and OpenAI-compatible agent connection.</p>
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
              <span>OpenAI-compatible agent</span>
              <small>Required endpoint, optional credentials</small>
            </div>

            <label className="settings-field">
              <span>Base URL</span>
              <input
                name="agentBaseUrl"
                value={form.agentBaseUrl}
                onChange={handleChange}
                placeholder="http://localhost:11434/v1"
                required
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

            <p className="settings-helper-text">Leave the API key blank for local providers. Scribe will automatically use <code>1234</code>.</p>

            <label className="settings-field">
              <span>Model</span>
              <input
                name="agentModel"
                value={form.agentModel}
                onChange={handleChange}
                placeholder="gpt-4"
              />
            </label>
          </section>

          {(error || status || loading) && (
            <div className={`settings-status ${error ? 'error' : 'success'}`}>
              {loading ? 'Loading saved settings...' : error || status}
            </div>
          )}

          <div className="settings-panel-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || loading}>
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

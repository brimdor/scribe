export function EnvironmentSettingsSection({ form, themeValue, onChange, onThemeChange }) {
  return (
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
          onChange={onChange}
          placeholder="Local development"
        />
      </label>

      <label className="settings-field">
        <span>Theme</span>
        <select value={themeValue} onChange={onThemeChange}>
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
    </section>
  );
}

export function GitHubSettingsSection({
  user,
  form,
  orgs,
  repos,
  fetchingOrgs,
  fetchingRepos,
  syncingRepo,
  saving,
  loading,
  syncBadge,
  repoSyncMeta,
  onChange,
  onSyncNow,
}) {
  return (
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
          onChange={onChange}
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
          onChange={onChange}
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
          onClick={onSyncNow}
          disabled={saving || loading || syncingRepo || !form.githubOwner || !form.githubRepo}
        >
          {syncingRepo ? 'Refreshing...' : 'Refresh repository'}
        </button>
        <div className="settings-sync-meta">
          <span className={`settings-oauth-badge settings-sync-badge ${syncBadge.tone}`}>{syncBadge.label}</span>
          <span className="settings-helper-text">
            {repoSyncMeta?.message || 'Refresh pulls the latest remote changes when safe. Publishing note edits happens separately through agent tools.'}
          </span>
        </div>
      </div>
    </section>
  );
}

export function AIProviderSettingsSection({
  form,
  settings,
  fetchingModels,
  agentModels,
  toolCatalog,
  toolGroups,
  clearAgentApiKey,
  saving,
  loading,
  oauthBusy,
  isOAuthConnected,
  isOAuthConnecting,
  connectionLabel,
  connectionTone,
  openAIOAuthSession,
  devicePendingFlow,
  manualKeyConfigured,
  onChange,
  onConnect,
  onDisconnect,
  onToggleClearAgentApiKey,
}) {
  return (
    <section className="settings-section settings-section-agent">
      <div className="settings-section-heading">
        <span>OpenAI and compatible providers</span>
        <small>Use OpenAI sign-in or keep the manual endpoint workflow</small>
      </div>

      <label className="settings-field">
        <span>Connection mode</span>
        <select name="openaiConnectionMethod" value={form.openaiConnectionMethod} onChange={onChange}>
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
            <button type="button" className="btn-primary" onClick={onConnect} disabled={oauthBusy || saving || loading || isOAuthConnecting}>
              {isOAuthConnecting ? 'Waiting for approval...' : isOAuthConnected ? 'Reconnect OpenAI' : 'Connect OpenAI'}
            </button>
            <button type="button" className="btn-ghost" onClick={onDisconnect} disabled={(!isOAuthConnected && !isOAuthConnecting) || oauthBusy || saving || loading}>
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
              onChange={onChange}
              placeholder="http://localhost:11434/v1"
            />
          </label>

          <label className="settings-field">
            <span>API key</span>
            <input
              name="agentApiKey"
              type="password"
              value={form.agentApiKey}
              onChange={onChange}
              placeholder={manualKeyConfigured ? 'Saved on server - enter a new key to replace it' : 'Optional'}
              autoComplete="off"
            />
          </label>

          {settings.agentApiKeyConfigured && (
            <div className="settings-sync-meta">
              <span className={`settings-oauth-badge settings-sync-badge ${clearAgentApiKey ? 'error' : 'success'}`}>
                {clearAgentApiKey ? 'Key will be removed' : 'Key saved on server'}
              </span>
              <button
                type="button"
                className="btn-ghost settings-sync-button"
                onClick={onToggleClearAgentApiKey}
                disabled={saving || loading}
              >
                {clearAgentApiKey ? 'Keep saved key' : 'Remove saved key'}
              </button>
            </div>
          )}

          <p className="settings-helper-text">
            Keep manual mode for local or third-party OpenAI-compatible providers. Scribe stores manual API keys server-side only. If your provider does not require a key, Scribe will continue to use <code>1234</code> as the fallback value.
          </p>
        </>
      )}

      <label className="settings-field">
        <span>Model</span>
        {form.openaiConnectionMethod === 'oauth' && isOAuthConnected ? (
          <select
            name="agentModel"
            value={form.agentModel}
            onChange={onChange}
            disabled={fetchingModels || !agentModels.length}
          >
            {fetchingModels ? (
              <option value="">Loading models...</option>
            ) : agentModels.length > 0 ? (
              <>
                <option value="" disabled>Select a model</option>
                {agentModels.map((model) => (
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
            onChange={onChange}
            placeholder={form.openaiConnectionMethod === 'oauth' ? 'Connect OpenAI first' : 'gpt-4o'}
            disabled={form.openaiConnectionMethod === 'oauth'}
          />
        )}
      </label>

      <div className="settings-card settings-tools-card">
        <div className="settings-card-row settings-tools-header">
          <div>
            <span>Agent tool suite</span>
            <strong>{toolCatalog.length} tools available</strong>
          </div>
          <div className={`settings-oauth-badge ${form.openaiConnectionMethod === 'manual' ? 'success' : 'info'}`}>
            {form.openaiConnectionMethod === 'manual' ? 'Tool ready' : 'Tool routed'}
          </div>
        </div>
        <p className="settings-helper-text">
          Manual OpenAI-compatible providers use native tool calling. OpenAI sign-in uses the same reusable tool registry through Scribe-managed routing, so note lookup, save, move, delete, file inspection, and publish flows stay grounded in actual tool results.
        </p>
        <div className="settings-tool-groups">
          {Object.entries(toolGroups).map(([category, tools]) => (
            <div key={category} className="settings-tool-group">
              <span className="settings-tool-group-title">{category}</span>
              <div className="settings-tool-chips">
                {tools.map((tool) => (
                  <span key={tool.name} className="settings-tool-chip" title={tool.description}>{tool.name}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

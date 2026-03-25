import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { getHeartbeats } from '../../services/storage';
import './HeartbeatPanel.css';

export default function HeartbeatPanel({ isOpen, onClose }) {
  const { heartbeatStatus, triggerHeartbeat, settings } = useSettings();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [runningManual, setRunningManual] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setLoadingHistory(true);
    getHeartbeats({ limit: 20, offset: 0 })
      .then((response) => {
        setHistory(response.heartbeats || []);
      })
      .catch(() => {
        setHistory([]);
      })
      .finally(() => setLoadingHistory(false));
  }, [isOpen, heartbeatStatus.lastExecution]);

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

  const handleRunNow = useCallback(async () => {
    setRunningManual(true);
    try {
      await triggerHeartbeat();
    } finally {
      setRunningManual(false);
    }
  }, [triggerHeartbeat]);

  if (!isOpen) {
    return null;
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return '\u2014';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (startedAt, completedAt) => {
    if (!startedAt || !completedAt) return '\u2014';
    const ms = completedAt - startedAt;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getRatingClass = (rating) => {
    if (rating >= 4) return 'success';
    if (rating >= 2) return 'warning';
    return 'error';
  };

  return (
    <>
      <div className="heartbeat-panel-backdrop" onClick={onClose} />
      <aside className="heartbeat-panel" aria-label="Heartbeat panel" role="dialog" aria-modal="true">
        <div className="heartbeat-panel-header">
          <div>
            <p className="heartbeat-panel-eyebrow">Agent monitoring</p>
            <h2>Heartbeat</h2>
            <p className="heartbeat-panel-subtitle">
              Periodic health checks performed by the agent.
              {settings.heartbeatEnabled
                ? ` Running every ${settings.heartbeatIntervalMinutes} minutes.`
                : ' Currently disabled.'}
            </p>
          </div>
          <button type="button" className="btn-icon heartbeat-panel-close" onClick={onClose} aria-label="Close heartbeat panel">
            &#x2715;
          </button>
        </div>

        <div className="heartbeat-panel-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleRunNow}
            disabled={runningManual || heartbeatStatus.isRunning}
          >
            {heartbeatStatus.isRunning ? 'Running...' : 'Run heartbeat now'}
          </button>
        </div>

        <div className="heartbeat-panel-content">
          {loadingHistory ? (
            <div className="heartbeat-loading">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="heartbeat-empty">
              <p>No heartbeat executions yet.</p>
              <p className="heartbeat-empty-hint">
                {settings.heartbeatEnabled
                  ? 'The first heartbeat will run at the next scheduled interval, or click "Run heartbeat now" above.'
                  : 'Enable the heartbeat in Settings, or click "Run heartbeat now" to trigger one manually.'}
              </p>
            </div>
          ) : (
            <div className="heartbeat-history">
              {history.map((entry) => (
                <div key={entry.id} className="heartbeat-entry">
                  <div className="heartbeat-entry-header">
                    <div className="heartbeat-entry-meta">
                      <span className="heartbeat-entry-time">{formatTime(entry.startedAt)}</span>
                      <span className="heartbeat-entry-duration">{formatDuration(entry.startedAt, entry.completedAt)}</span>
                    </div>
                    <div className={`heartbeat-entry-badge ${getRatingClass(entry.rating)}`}>
                      {entry.rating}/5
                    </div>
                  </div>
                  {entry.checklist && entry.checklist.length > 0 && (
                    <div className="heartbeat-checklist">
                      {entry.checklist.map((item) => (
                        <div key={item.name} className="heartbeat-checklist-item">
                          <span className={`heartbeat-checklist-indicator ${item.result}`} />
                          <span className="heartbeat-checklist-label">{item.label}</span>
                          <span className="heartbeat-checklist-detail">{item.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

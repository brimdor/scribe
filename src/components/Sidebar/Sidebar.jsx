import { useState, useEffect, useCallback } from 'react';
import { getAllThreads, deleteThread, updateThread } from '../../services/storage';
import './Sidebar.css';

export default function Sidebar({ activeThreadId, onSelectThread, onNewChat, refreshKey }) {
  const [threads, setThreads] = useState([]);

  const loadThreads = useCallback(async () => {
    const data = await getAllThreads();
    setThreads(data);
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, refreshKey]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteThread(id);
    if (activeThreadId === id) onNewChat();
    await loadThreads();
  };

  const handlePin = async (e, id, isPinned) => {
    e.stopPropagation();
    await updateThread(id, { isPinned: !isPinned });
    await loadThreads();
  };

  const pinnedThreads = threads.filter(t => t.isPinned);
  const recentThreads = threads.filter(t => !t.isPinned);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      {pinnedThreads.length > 0 && (
        <>
          <div className="sidebar-section-title">📌 Pinned</div>
          <div className="thread-list">
            {pinnedThreads.map(thread => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onSelect={onSelectThread}
                onDelete={handleDelete}
                onPin={handlePin}
              />
            ))}
          </div>
        </>
      )}

      <div className="sidebar-section-title">Recent</div>
      <div className="thread-list">
        {recentThreads.length === 0 && threads.length === 0 ? (
          <div className="sidebar-empty">
            No conversations yet.<br />Start a new chat to begin!
          </div>
        ) : (
          recentThreads.map(thread => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onSelect={onSelectThread}
              onDelete={handleDelete}
              onPin={handlePin}
            />
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-link" onClick={() => window.open('https://github.com/brimdor/scribe', '_blank')}>
          ❓ Help & Docs
        </div>
        <div className="sidebar-footer-link">
          ⚙️ Settings
        </div>
      </div>
    </div>
  );
}

function ThreadItem({ thread, isActive, onSelect, onDelete, onPin }) {
  return (
    <div
      className={`thread-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(thread.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(thread.id)}
    >
      {thread.isPinned && <span className="thread-pin-icon">📌</span>}
      <span className="thread-item-title">{thread.title || 'New Chat'}</span>
      <div className="thread-actions">
        <button
          className="thread-action-btn"
          onClick={(e) => onPin(e, thread.id, thread.isPinned)}
          title={thread.isPinned ? 'Unpin' : 'Pin'}
        >
          {thread.isPinned ? '📌' : '📍'}
        </button>
        <button
          className="thread-action-btn"
          onClick={(e) => handleDeleteClick(e, thread.id, onDelete)}
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function handleDeleteClick(e, id, onDelete) {
  if (window.confirm('Delete this conversation?')) {
    onDelete(e, id);
  }
}

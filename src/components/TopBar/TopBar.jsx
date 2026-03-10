import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { builtInSchemas } from '../../schemas';
import './TopBar.css';

export default function TopBar({ sidebarOpen, onToggleSidebar, activeSchema, onSchemaSelect }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const schemaRef = useRef(null);
  const menuRef = useRef(null);

  // Click outside handlers
  useEffect(() => {
    const handler = (e) => {
      if (schemaRef.current && !schemaRef.current.contains(e.target)) setSchemaOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedSchema = builtInSchemas.find(s => s.id === activeSchema);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="btn-icon topbar-toggle" onClick={onToggleSidebar} title="Toggle sidebar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {sidebarOpen ? (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
        <div className="topbar-brand">
          <span className="topbar-brand-icon">✍️</span>
          <span>Scribe</span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="schema-select" ref={schemaRef} onClick={() => setSchemaOpen(!schemaOpen)}>
          <span className="schema-select-icon">{selectedSchema?.icon || '📝'}</span>
          <span>{selectedSchema?.name || 'Free-form Note'}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>

          {schemaOpen && (
            <div className="schema-dropdown">
              <div
                className={`schema-option ${!activeSchema ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSchemaSelect(null); setSchemaOpen(false); }}
              >
                <span className="schema-option-icon">📝</span>
                <div className="schema-option-info">
                  <span className="schema-option-name">Free-form Note</span>
                  <span className="schema-option-desc">No template — flexible format</span>
                </div>
              </div>
              {builtInSchemas.map(schema => (
                <div
                  key={schema.id}
                  className={`schema-option ${activeSchema === schema.id ? 'active' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onSchemaSelect(schema.id); setSchemaOpen(false); }}
                >
                  <span className="schema-option-icon">{schema.icon}</span>
                  <div className="schema-option-info">
                    <span className="schema-option-name">{schema.name}</span>
                    <span className="schema-option-desc">{schema.description}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <button className="btn-icon" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <div ref={menuRef} style={{ position: 'relative' }}>
          {user?.avatarUrl ? (
            <img
              className="user-avatar"
              src={user.avatarUrl}
              alt={user.name || user.login}
              onClick={() => setMenuOpen(!menuOpen)}
            />
          ) : (
            <button className="btn-icon" onClick={() => setMenuOpen(!menuOpen)}>👤</button>
          )}

          {menuOpen && (
            <div className="user-menu">
              <div className="user-menu-item" style={{ fontWeight: 500 }}>
                {user?.name || user?.login}
              </div>
              <div className="user-menu-divider" />
              <button className="user-menu-item" onClick={() => { setMenuOpen(false); }}>
                ⚙️ Settings
              </button>
              <button className="user-menu-item user-menu-logout" onClick={() => { logout(); setMenuOpen(false); }}>
                🚪 Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import SettingsPanel from '../Settings/SettingsPanel';
import HeartbeatPanel from '../Heartbeat/HeartbeatPanel';
import TopBar from '../TopBar/TopBar';
import ChatWindow from '../Chat/ChatWindow';
import InputConsole from '../Chat/InputConsole';
import ErrorBoundary from '../ErrorBoundary';
import { useSettings } from '../../context/SettingsContext';
import './Layout.css';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeSchema, setActiveSchema] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isSettingsOpen, openSettings, closeSettings, isHeartbeatPanelOpen, closeHeartbeatPanel } = useSettings();

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveThreadId(null);
    setRefreshKey(k => k + 1);
  }, []);

  const handleSelectThread = useCallback((threadId) => {
    setActiveThreadId(threadId);
    setRefreshKey(k => k + 1);
    // On mobile, close sidebar after selecting
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSchemaSelect = useCallback((schema) => {
    setActiveSchema(schema);
  }, []);

  const handleThreadCreated = useCallback((threadId) => {
    setActiveThreadId(threadId);
  }, []);

  return (
    <div className="layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className={`sidebar-overlay ${!sidebarOpen ? 'hidden' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`layout-sidebar ${!sidebarOpen ? 'collapsed' : ''}`}>
        <Sidebar
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          onOpenSettings={openSettings}
          refreshKey={refreshKey}
        />
      </aside>

      {/* Main Content */}
      <main className="layout-main">
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          activeSchema={activeSchema}
          onSchemaSelect={handleSchemaSelect}
          onOpenSettings={openSettings}
        />
        <ChatWindow
          key={refreshKey}
          threadId={activeThreadId}
        />
        <InputConsole
          threadId={activeThreadId}
          activeSchema={activeSchema}
          onThreadCreated={handleThreadCreated}
          refreshKey={refreshKey}
        />
        <ErrorBoundary>
          <SettingsPanel isOpen={isSettingsOpen} onClose={closeSettings} />
        </ErrorBoundary>
        <HeartbeatPanel isOpen={isHeartbeatPanelOpen} onClose={closeHeartbeatPanel} />
      </main>
    </div>
  );
}

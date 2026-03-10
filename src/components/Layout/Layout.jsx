import { useState, useCallback } from 'react';
import Sidebar from '../Sidebar/Sidebar';
import TopBar from '../TopBar/TopBar';
import ChatWindow from '../Chat/ChatWindow';
import InputConsole from '../Chat/InputConsole';
import './Layout.css';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeSchema, setActiveSchema] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
        />
        <ChatWindow
          key={refreshKey}
          threadId={activeThreadId}
          activeSchema={activeSchema}
        />
        <InputConsole
          threadId={activeThreadId}
          activeSchema={activeSchema}
          onThreadCreated={handleThreadCreated}
          refreshKey={refreshKey}
        />
      </main>
    </div>
  );
}

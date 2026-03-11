import { useState, useEffect, useRef, useCallback } from 'react';
import { getMessagesByThread } from '../../services/storage';
import MessageBubble from './MessageBubble';
import { useAuth } from '../../context/AuthContext';
import './ChatWindow.css';

const SUGGESTIONS = [
  { icon: '📋', title: 'Meeting Notes', desc: 'Capture today\'s standup', prompt: 'Create meeting notes for today\'s standup meeting' },
  { icon: '📓', title: 'Daily Journal', desc: 'Reflect on your day', prompt: 'Start my daily journal entry for today' },
  { icon: '🔬', title: 'Research Notes', desc: 'Document findings', prompt: 'Help me create research notes about a topic I\'m studying' },
  { icon: '🗂️', title: 'Project Plan', desc: 'Outline a new project', prompt: 'Create a project plan for a new initiative' },
];

export default function ChatWindow({ threadId }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingModelMeta, setStreamingModelMeta] = useState(null);
  const messagesEndRef = useRef(null);

  const loadMessages = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    const data = await getMessagesByThread(threadId);
    setMessages(data);
  }, [threadId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Listen for new messages via custom events
  useEffect(() => {
    const handleNewMessage = (e) => {
      if (e.detail.threadId === threadId) {
        loadMessages();
      }
    };

    const handleStreamStart = (e) => {
      if (threadId && e?.detail?.threadId && e.detail.threadId !== threadId) {
        return;
      }
      setStreaming(true);
      setStreamingContent('');
      setStreamingModelMeta(e?.detail?.modelMeta || null);
    };

    const handleStreamChunk = (e) => {
      if (threadId && e.detail?.threadId && e.detail.threadId !== threadId) {
        return;
      }
      setStreamingContent(e.detail.fullText);
    };

    const handleStreamMeta = (e) => {
      if (threadId && e.detail?.threadId && e.detail.threadId !== threadId) {
        return;
      }
      setStreamingModelMeta(e.detail?.modelMeta || null);
    };

    const handleStreamEnd = (e) => {
      setStreaming(false);
      setStreamingContent('');
      setStreamingModelMeta(null);
      if (e?.detail?.threadId === threadId) {
        loadMessages();
      }
    };

    window.addEventListener('scribe:new-message', handleNewMessage);
    window.addEventListener('scribe:stream-start', handleStreamStart);
    window.addEventListener('scribe:stream-chunk', handleStreamChunk);
    window.addEventListener('scribe:stream-meta', handleStreamMeta);
    window.addEventListener('scribe:stream-end', handleStreamEnd);

    return () => {
      window.removeEventListener('scribe:new-message', handleNewMessage);
      window.removeEventListener('scribe:stream-start', handleStreamStart);
      window.removeEventListener('scribe:stream-chunk', handleStreamChunk);
      window.removeEventListener('scribe:stream-meta', handleStreamMeta);
      window.removeEventListener('scribe:stream-end', handleStreamEnd);
    };
  }, [threadId, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSuggestionClick = (prompt) => {
    // Dispatch event to inform InputConsole
    window.dispatchEvent(new CustomEvent('scribe:suggestion-click', { detail: { prompt } }));
  };

  // Empty state
  if (!threadId && messages.length === 0) {
    const greeting = getGreeting();
    return (
      <div className="chat-window">
        <div className="chat-empty">
          <div className="chat-empty-icon">✍️</div>
          <h2 className="chat-empty-greeting">{greeting}, {user?.name?.split(' ')[0] || user?.login || 'there'}!</h2>
          <p className="chat-empty-subtitle">
            I'm Scribe, your AI notetaking assistant. I can help you create 
            structured notes that sync to your GitHub repository.
          </p>
          <div className="suggestion-cards">
            {SUGGESTIONS.map((s, i) => (
              <div key={i} className="suggestion-card" onClick={() => handleSuggestionClick(s.prompt)}>
                <span className="suggestion-card-icon">{s.icon}</span>
                <span className="suggestion-card-title">{s.title}</span>
                <span className="suggestion-card-desc">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {streaming && streamingContent && (
          <MessageBubble
            message={{ role: 'assistant', content: streamingContent, modelMeta: streamingModelMeta }}
            isStreaming
          />
        )}
        {streaming && !streamingContent && (
          <div className="typing-indicator">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

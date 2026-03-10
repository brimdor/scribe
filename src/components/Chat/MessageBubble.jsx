import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../../context/AuthContext';
import ResponseBar from './ResponseBar';
import './MessageBubble.css';

export default function MessageBubble({ message, isStreaming = false }) {
  const { user } = useAuth();
  const isUser = message.role === 'user';

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-avatar-wrapper">
        {isUser ? (
          <div className="message-avatar">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name || user.login} />
            ) : (
              '👤'
            )}
          </div>
        ) : (
          <div className="message-avatar ai">✍️</div>
        )}
      </div>

      <div className="message-content">
        <div className={`message-body ${isStreaming ? 'streaming' : ''}`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {message.timestamp && (
          <div className="message-timestamp">{formatTime(message.timestamp)}</div>
        )}

        {!isUser && !isStreaming && message.id && (
          <ResponseBar message={message} />
        )}
      </div>
    </div>
  );
}

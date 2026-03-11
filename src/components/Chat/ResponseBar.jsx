import { useState, useCallback } from 'react';
import { buildSaveNotePrompt, inferNotePathFromContent, isLikelySavableNote } from '../../utils/note-publish';
import './ResponseBar.css';

export default function ResponseBar({ message }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const [saveState, setSaveState] = useState('idle');
  const canSaveNote = isLikelySavableNote(message.content);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [message.content]);

  const handleFeedback = useCallback((type) => {
    setFeedback(prev => prev === type ? null : type);
  }, []);

  const handleSaveNote = useCallback(() => {
    const inferredPath = inferNotePathFromContent(message.content);
    const prompt = buildSaveNotePrompt(message.content, { filePath: inferredPath });

    window.dispatchEvent(new CustomEvent('scribe:save-note-request', {
      detail: {
        messageId: message.id,
        prompt,
        inferredPath,
      },
    }));

    setSaveState('queued');
    window.setTimeout(() => {
      setSaveState('idle');
    }, 2500);
  }, [message.content, message.id]);

  return (
    <div className="response-bar">
      {canSaveNote && (
        <button
          className="response-bar-btn response-bar-btn-accent"
          onClick={handleSaveNote}
          disabled={saveState === 'queued'}
          title="Save this note to the selected repo and publish it"
        >
          {saveState === 'queued' ? '✓ Agent queued' : 'Publish note'}
        </button>
      )}

      <button className="response-bar-btn" onClick={handleCopy} title="Copy">
        {copied ? (
          <span className="copied-tooltip">✓ Copied</span>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copy
          </>
        )}
      </button>

      <button
        className={`response-bar-btn ${feedback === 'up' ? 'active' : ''}`}
        onClick={() => handleFeedback('up')}
        title="Good response"
      >
        👍
      </button>

      <button
        className={`response-bar-btn ${feedback === 'down' ? 'active' : ''}`}
        onClick={() => handleFeedback('down')}
        title="Bad response"
      >
        👎
      </button>

      <button className="response-bar-btn" onClick={() => {
        window.dispatchEvent(new CustomEvent('scribe:regenerate', { detail: { messageId: message.id } }));
      }} title="Regenerate">
        🔄 Regenerate
      </button>
    </div>
  );
}

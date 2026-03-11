import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createThread, addMessage, getMessagesByThread, getThread, updateThread } from '../../services/storage';
import { streamChat, generateTitle, getFallbackTitle, initOpenAI, getOpenAIClient, getOpenAIConfig } from '../../services/openai';
import { getSchemaTemplate } from '../../schemas';
import { useSettings } from '../../context/SettingsContext';
import './InputConsole.css';

function normalizeModelMeta(config) {
  const provider = config?.provider === 'oauth' ? 'oauth' : 'manual';
  const requestedModel = (config?.model || '').trim() || (provider === 'oauth' ? 'auto' : 'gpt-4');
  return {
    provider,
    requestedModel,
    usedModel: '',
    fallbackReason: '',
  };
}

export default function InputConsole({ threadId, activeSchema, onThreadCreated }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const { settings, openAIOAuthSession } = useSettings();

  const updateThreadTitle = useCallback(async (currentThreadId, nextTitle) => {
    const title = nextTitle?.trim();
    if (!title) return;

    await updateThread(currentThreadId, { title });
    window.dispatchEvent(new CustomEvent('scribe:thread-updated', {
      detail: { threadId: currentThreadId, title },
    }));
  }, []);

  const canAutoTitleThread = useCallback(async (currentThreadId) => {
    const thread = await getThread(currentThreadId);
    return !thread?.title || thread.title === 'New Chat';
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  // Listen for suggestion clicks
  useEffect(() => {
    const handler = (e) => {
      setText(e.detail.prompt);
      textareaRef.current?.focus();
    };
    window.addEventListener('scribe:suggestion-click', handler);
    return () => window.removeEventListener('scribe:suggestion-click', handler);
  }, []);

  useEffect(() => {
    initOpenAI({
      ...settings,
      openaiOAuthSession: openAIOAuthSession,
    });
  }, [settings, openAIOAuthSession]);

  const sendMessage = useCallback(async (overrideText = '') => {
    const content = String(overrideText || text).trim();
    if (!content || sending) return;

    setSending(true);
    if (!overrideText) {
      setText('');
    }

    let currentThreadId = threadId;
    const currentConfig = getOpenAIConfig();
    const requestedModelMeta = normalizeModelMeta(currentConfig);

    try {
      // Create thread if needed
      if (!currentThreadId) {
        const newThread = {
          id: uuidv4(),
          title: 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isPinned: false,
        };
        await createThread(newThread);
        currentThreadId = newThread.id;
        onThreadCreated(currentThreadId);
      }

      // Save user message
      const userMsg = {
        id: uuidv4(),
        threadId: currentThreadId,
        role: 'user',
        content,
        timestamp: Date.now(),
        modelMeta: requestedModelMeta,
      };
      await addMessage(userMsg);
      window.dispatchEvent(new CustomEvent('scribe:new-message', { detail: { threadId: currentThreadId } }));

      // Build message history
      const history = await getMessagesByThread(currentThreadId);
      const chatMessages = history.map(m => ({ role: m.role, content: m.content }));

      // Get schema context
      const schemaTemplate = activeSchema ? getSchemaTemplate(activeSchema) : null;

      // Check if OpenAI is available
      if (!getOpenAIClient()) {
        const message = currentConfig?.provider === 'oauth'
          ? '⚠️ **OpenAI sign-in is not active.** Reconnect OpenAI in Settings or switch back to the manual provider mode.\n\nFor now, you can still:\n- Browse your GitHub notes\n- Manage conversation threads\n- Select note schemas'
          : '⚠️ **Agent settings incomplete.** Add an OpenAI-compatible base URL in Settings to enable AI-powered note generation.\n\nIf your provider does not require an API key, you can leave that field blank and Scribe will use the fallback value `1234`.\n\nFor now, you can still:\n- Browse your GitHub notes\n- Manage conversation threads\n- Select note schemas';

        // No OpenAI key — generate a placeholder response
        const aiMsg = {
          id: uuidv4(),
          threadId: currentThreadId,
          role: 'assistant',
          content: message,
          timestamp: Date.now(),
          modelMeta: {
            ...requestedModelMeta,
            usedModel: requestedModelMeta.requestedModel,
          },
        };
        await addMessage(aiMsg);
        window.dispatchEvent(new CustomEvent('scribe:stream-end', { detail: { threadId: currentThreadId } }));
        
        if (await canAutoTitleThread(currentThreadId)) {
          await updateThreadTitle(currentThreadId, getFallbackTitle(content));
        }

        setSending(false);
        return;
      }

      // Stream AI response
      window.dispatchEvent(new CustomEvent('scribe:stream-start', {
        detail: {
          threadId: currentThreadId,
          modelMeta: requestedModelMeta,
        },
      }));
      abortRef.current = new AbortController();
      let responseModelMeta = {
        ...requestedModelMeta,
        usedModel: requestedModelMeta.requestedModel,
      };

      const fullText = await streamChat(
        chatMessages,
        schemaTemplate,
        (chunk, fullText) => {
          window.dispatchEvent(new CustomEvent('scribe:stream-chunk', { detail: { threadId: currentThreadId, chunk, fullText } }));
        },
        abortRef.current.signal,
        (nextMeta) => {
          responseModelMeta = {
            ...responseModelMeta,
            ...nextMeta,
            requestedModel: nextMeta?.requestedModel || responseModelMeta.requestedModel,
            usedModel: nextMeta?.usedModel || responseModelMeta.usedModel,
            fallbackReason: nextMeta?.fallbackReason || responseModelMeta.fallbackReason || '',
          };
          window.dispatchEvent(new CustomEvent('scribe:stream-meta', {
            detail: {
              threadId: currentThreadId,
              modelMeta: responseModelMeta,
            },
          }));
        },
      );

      // Save AI response
      const aiMsg = {
        id: uuidv4(),
        threadId: currentThreadId,
        role: 'assistant',
        content: fullText,
        timestamp: Date.now(),
        modelMeta: {
          ...responseModelMeta,
          usedModel: responseModelMeta.usedModel || responseModelMeta.requestedModel,
        },
      };
      await addMessage(aiMsg);
      window.dispatchEvent(new CustomEvent('scribe:stream-end', { detail: { threadId: currentThreadId } }));

      // Auto-generate title if this is the first message
      if (history.length <= 1) {
        try {
          const title = await generateTitle(content);
          if (await canAutoTitleThread(currentThreadId)) {
            await updateThreadTitle(currentThreadId, title || getFallbackTitle(content));
          }
        } catch {
          if (await canAutoTitleThread(currentThreadId)) {
            await updateThreadTitle(currentThreadId, getFallbackTitle(content));
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Send error:', err);
        const errorMsg = {
          id: uuidv4(),
          threadId: currentThreadId,
          role: 'assistant',
          content: `❌ **Error:** ${err.message || 'Something went wrong. Please try again.'}`,
          timestamp: Date.now(),
          modelMeta: {
            ...requestedModelMeta,
            usedModel: requestedModelMeta.requestedModel,
            fallbackReason: '',
          },
        };
        await addMessage(errorMsg);
        window.dispatchEvent(new CustomEvent('scribe:stream-end', { detail: { threadId: currentThreadId } }));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [text, sending, threadId, activeSchema, onThreadCreated, updateThreadTitle, canAutoTitleThread]);

  useEffect(() => {
    const handleSaveNoteRequest = (event) => {
      const prompt = String(event?.detail?.prompt || '').trim();
      if (!prompt || sending) {
        return;
      }

      sendMessage(prompt);
    };

    window.addEventListener('scribe:save-note-request', handleSaveNoteRequest);
    return () => window.removeEventListener('scribe:save-note-request', handleSaveNoteRequest);
  }, [sendMessage, sending]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  return (
    <div className="input-console-wrapper">
      <div className="input-console">
        <div className="input-field-container">
          <textarea
            ref={textareaRef}
            className="input-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Scribe to create a note..."
            rows={1}
            disabled={sending}
          />
          <div className="input-actions">
            <button className="input-action-btn" title="Attach file" disabled>
              📎
            </button>
            <button className="input-action-btn" title="Voice input" disabled>
              🎤
            </button>
          </div>
        </div>
        {sending ? (
          <button className="send-btn" onClick={handleStop} title="Stop generating">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button className="send-btn" onClick={() => sendMessage()} disabled={!text.trim()} title="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
      <div className="input-disclaimer">
        Scribe uses AI to generate notes. Always review content before saving.
      </div>
    </div>
  );
}

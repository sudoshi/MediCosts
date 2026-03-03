import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import s from './AbbyAnalytics.module.css';

const API = import.meta.env.VITE_API_URL || '';

/* ── Lightweight markdown renderer ──────────────────── */
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>');

  // Tables — detect lines with | separators
  html = html.replace(
    /((?:^.*\|.*$\n?){2,})/gm,
    (block) => {
      const rows = block.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return block;
      // Check if second row is a separator (---|---|--)
      const isSep = /^[\s|:-]+$/.test(rows[1]);
      if (!isSep) return block;

      const headerCells = rows[0].split('|').map(c => c.trim()).filter(Boolean);
      const dataRows = rows.slice(2);

      let table = '<table><thead><tr>';
      headerCells.forEach(c => { table += `<th>${c}</th>`; });
      table += '</tr></thead><tbody>';
      dataRows.forEach(row => {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
        table += '<tr>';
        cells.forEach(c => { table += `<td>${c}</td>`; });
        table += '</tr>';
      });
      table += '</tbody></table>';
      return table;
    }
  );

  // Unordered lists
  html = html.replace(
    /((?:^- .+$\n?)+)/gm,
    (block) => {
      const items = block.trim().split('\n').map(l => l.replace(/^- /, ''));
      return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
    }
  );

  // Ordered lists
  html = html.replace(
    /((?:^\d+\. .+$\n?)+)/gm,
    (block) => {
      const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, ''));
      return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
    }
  );

  // Paragraphs — wrap remaining plain lines
  html = html
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (/^<[huptol]/.test(trimmed)) return trimmed;
      if (/^<hr/.test(trimmed)) return trimmed;
      return `<p>${trimmed}</p>`;
    })
    .join('\n');

  return html;
}

/* ── Send arrow SVG ─────────────────────────────────── */
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/* ── Main component ─────────────────────────────────── */
const STORAGE_KEY = 'abby_messages';
const SESSION_KEY = 'abby_session_id';

function loadSavedMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function apiCall(path, opts = {}) {
  const token = localStorage.getItem('authToken');
  const resp = await fetch(`${API}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json();
}

export default function AbbyAnalytics() {
  const [messages, setMessages] = useState(loadSavedMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [patientHandoffDone, setPatientHandoffDone] = useState(false);
  const [estimatorHandoffDone, setEstimatorHandoffDone] = useState(false);
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [sessions, setSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const location = useLocation();

  // Persist messages to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); }
    catch { /* quota exceeded — ignore */ }
  }, [messages]);

  // Load session history
  const loadSessions = useCallback(async () => {
    try {
      const d = await apiCall('/abby/sessions');
      setSessions(d.sessions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Ensure a session exists when first message is sent
  async function ensureSession() {
    if (sessionId) return sessionId;
    try {
      const d = await apiCall('/abby/sessions', { method: 'POST', body: JSON.stringify({ title: 'New Conversation' }) });
      const sid = d.session_id;
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, sid);
      return sid;
    } catch { return null; }
  }

  // Save a message pair to the DB session
  async function saveToSession(sid, userMsg, assistantMsg) {
    if (!sid) return;
    try {
      await apiCall(`/abby/sessions/${sid}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messages: [userMsg, assistantMsg] }),
      });
    } catch { /* non-critical — don't break the chat */ }
  }

  async function clearConversation() {
    setMessages([]);
    setSessionId(null);
    setError('');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    // Create a fresh session
    try {
      const d = await apiCall('/abby/sessions', { method: 'POST', body: JSON.stringify({ title: 'New Conversation' }) });
      setSessionId(d.session_id);
      localStorage.setItem(SESSION_KEY, d.session_id);
    } catch { /* ignore */ }
    loadSessions();
  }

  async function loadSession(sid) {
    try {
      const d = await apiCall(`/abby/sessions/${sid}/messages`);
      const msgs = (d.messages || []).map(m => ({ role: m.role, content: m.content }));
      setMessages(msgs);
      setSessionId(sid);
      localStorage.setItem(SESSION_KEY, sid);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
      setShowHistory(false);
    } catch (e) {
      setError('Failed to load conversation');
    }
  }

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, statusText, scrollToBottom]);

  // Check Ollama health + load suggestions on mount
  useEffect(() => {
    fetch(`${API}/api/abby/health`)
      .then(r => r.json())
      .then(setOllamaStatus)
      .catch(() => setOllamaStatus({ ollamaRunning: false }));

    fetch(`${API}/api/abby/suggestions`)
      .then(r => r.json())
      .then(setSuggestions)
      .catch(() => {});
  }, []);

  // Auto-send patient context from For Patients page
  const sendMessageRef = useRef(null);
  useEffect(() => {
    if (patientHandoffDone) return;
    const ctx = location.state?.patientContext;
    if (!ctx) return;
    setPatientHandoffDone(true);
    // Defer until sendMessage is defined
    const timer = setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current(ctx);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [location.state, patientHandoffDone]);

  // Auto-send estimator context from Cost Estimator page
  useEffect(() => {
    if (estimatorHandoffDone) return;
    const ctx = location.state?.estimatorContext;
    if (!ctx) return;
    setEstimatorHandoffDone(true);
    const timer = setTimeout(() => {
      if (sendMessageRef.current) {
        sendMessageRef.current(ctx);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [location.state, estimatorHandoffDone]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // Send message
  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || isLoading) return;

    setInput('');
    setError('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg = { role: 'user', content };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStatusText('Connecting...');

    try {
      const resp = await fetch(`${API}/api/abby/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            switch (currentEvent) {
              case 'status':
                setStatusText(parsed.text || '');
                break;
              case 'tool':
                setStatusText(`Searching: ${parsed.label || parsed.name}...`);
                break;
              case 'token':
                assistantContent += parsed.content;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return [...prev.slice(0, -1), { role: 'assistant', content: assistantContent }];
                  }
                  return [...prev, { role: 'assistant', content: assistantContent }];
                });
                setStatusText('');
                break;
              case 'error':
                throw new Error(parsed.message);
            }
          } catch (parseErr) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
          }

          currentEvent = 'message';
        }
      }

      // Ensure assistant message is finalized
      if (assistantContent) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: assistantContent }];
          }
          return [...prev, { role: 'assistant', content: assistantContent }];
        });
        // Save to DB session
        const sid = await ensureSession();
        await saveToSession(sid, userMsg, { role: 'assistant', content: assistantContent });
        loadSessions();
      }
    } catch (err) {
      setError(err.message || 'Failed to get response');
      // Restore input on failure
      setInput(content);
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  sendMessageRef.current = sendMessage;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isOnline = ollamaStatus?.ollamaRunning && ollamaStatus?.modelAvailable;
  const showWelcome = messages.length === 0;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <h1 className={s.title}>Abby Analytics</h1>
          {ollamaStatus && (
            <span
              className={`${s.statusDot} ${isOnline ? s.statusOnline : s.statusOffline}`}
              title={isOnline ? 'Ollama connected' : 'Ollama offline'}
            />
          )}
          {messages.length > 0 && (
            <button className={s.newConvoBtn} onClick={clearConversation}>New Conversation</button>
          )}
          {sessions.length > 0 && (
            <button
              className={s.historyBtn}
              onClick={() => setShowHistory(h => !h)}
              title="Conversation history"
            >
              History ({sessions.length})
            </button>
          )}
        </div>

        {/* Session history dropdown */}
        {showHistory && (
          <div className={s.historyPanel}>
            <div className={s.historyHeader}>Recent Conversations</div>
            {sessions.map(sess => (
              <button
                key={sess.session_id}
                className={`${s.historyItem} ${sess.session_id === sessionId ? s.historyItemActive : ''}`}
                onClick={() => loadSession(sess.session_id)}
              >
                <span className={s.historyTitle}>{sess.title || 'Conversation'}</span>
                <span className={s.historyMeta}>
                  {sess.message_count} msgs · {new Date(sess.last_active).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className={s.subtitle}>
          AI-powered Medicare data analysis — ask complex questions across cost, quality, safety, and geographic data
        </p>
      </div>

      {/* Chat container */}
      <div className={s.chatContainer}>
        {/* Messages */}
        <div className={s.messages}>
          {showWelcome && (
            <>
              <div className={s.welcome}>
                <div className={s.avatar}>A</div>
                <div className={s.welcomeTitle}>Hi, I'm Abby</div>
                <p className={s.welcomeText}>
                  I can help you explore Medicare hospital data — comparing hospitals, finding quality
                  leaders, analyzing costs, and uncovering patterns across 4,700+ facilities.
                  Ask me anything about hospital quality, safety, or costs.
                </p>
              </div>
              {suggestions.length > 0 && (
                <div className={s.suggestions}>
                  {suggestions.map((text, i) => (
                    <button
                      key={i}
                      className={s.chip}
                      onClick={() => sendMessage(text)}
                      disabled={isLoading}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`${s.message} ${msg.role === 'user' ? s.messageUser : s.messageAssistant}`}
            >
              <div className={`${s.msgAvatar} ${msg.role === 'user' ? s.msgAvatarUser : s.msgAvatarAbby}`}>
                {msg.role === 'user' ? 'U' : 'A'}
              </div>
              <div className={`${s.bubble} ${msg.role === 'user' ? s.bubbleUser : s.bubbleAssistant}`}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                )}
              </div>
            </div>
          ))}

          {/* Tool/status indicator */}
          {isLoading && statusText && (
            <div className={s.toolIndicator}>
              <span className={s.pulse} />
              {statusText}
            </div>
          )}

          {/* Error */}
          {error && <div className={s.errorBanner}>{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={s.inputArea}>
          <textarea
            ref={textareaRef}
            className={s.textarea}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isOnline ? 'Ask Abby about Medicare data...' : 'Waiting for Ollama connection...'}
            disabled={isLoading || !isOnline}
            rows={1}
          />
          <button
            className={s.sendBtn}
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim() || !isOnline}
            title="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className={s.disclaimer}>
        Abby uses CMS 2023 Medicare data. Results are informational only — not medical advice.
      </div>
    </div>
  );
}

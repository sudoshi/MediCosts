import { useState, useRef, useEffect, useCallback } from 'react';
import s from './AbbyPanel.module.css';

const API = import.meta.env.VITE_API_URL || '';

/* ── Lightweight markdown renderer ── */
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr/>');

  html = html.replace(/((?:^.*\|.*$\n?){2,})/gm, (block) => {
    const rows = block.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return block;
    if (!/^[\s|:-]+$/.test(rows[1])) return block;
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
    return table + '</tbody></table>';
  });

  html = html.replace(/((?:^- .+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^- /, ''));
    return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>';
  });

  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, ''));
    return '<ol>' + items.map(i => `<li>${i}</li>`).join('') + '</ol>';
  });

  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (/^<[huptol]/.test(trimmed) || /^<hr/.test(trimmed)) return trimmed;
    return `<p>${trimmed}</p>`;
  }).join('\n');

  return html;
}

/* ── Icons ── */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SparkleSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

/* ── Storage ── */
const STORAGE_KEY = 'abby_messages';
const SESSION_KEY = 'abby_session_id';

function loadSavedMessages() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
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

/* ── AbbyPanel ── */
export default function AbbyPanel({ isOpen, onClose, pageContext }) {
  const [messages, setMessages] = useState(loadSavedMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY));
  const [sessions, setSessions] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const sendMessageRef = useRef(null);

  // Persist messages
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50))); }
    catch { /* quota exceeded */ }
  }, [messages]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const d = await apiCall('/abby/sessions');
      setSessions(d.sessions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load suggestions on mount
  useEffect(() => {
    fetch(`${API}/api/abby/suggestions`)
      .then(r => r.json())
      .then(setSuggestions)
      .catch(() => {});
  }, []);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 320);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, statusText, scrollToBottom]);

  // Session helpers
  async function ensureSession() {
    if (sessionId) return sessionId;
    try {
      const d = await apiCall('/abby/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      });
      setSessionId(d.session_id);
      localStorage.setItem(SESSION_KEY, d.session_id);
      return d.session_id;
    } catch { return null; }
  }

  async function saveToSession(sid, userMsg, assistantMsg) {
    if (!sid) return;
    try {
      await apiCall(`/abby/sessions/${sid}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messages: [userMsg, assistantMsg] }),
      });
    } catch { /* non-critical */ }
  }

  async function clearConversation() {
    setMessages([]);
    setSessionId(null);
    setError('');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    try {
      const d = await apiCall('/abby/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Conversation' }),
      });
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
    } catch {
      setError('Failed to load conversation');
    }
  }

  // Auto-resize textarea
  function handleInputChange(e) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

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
    setStatusText('Thinking...');

    try {
      const resp = await fetch(`${API}/api/abby/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          pageContext: pageContext || null,
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
          if (line.startsWith('event: ')) { currentEvent = line.slice(7).trim(); continue; }
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
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          }
          currentEvent = 'message';
        }
      }

      if (assistantContent) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: assistantContent }];
          }
          return [...prev, { role: 'assistant', content: assistantContent }];
        });
        const sid = await ensureSession();
        await saveToSession(sid, userMsg, { role: 'assistant', content: assistantContent });
        loadSessions();
      }
    } catch (err) {
      setError(err.message || 'Failed to get response');
      setInput(content);
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  sendMessageRef.current = sendMessage;

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const showWelcome = messages.length === 0;

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isOpen && <div className={s.backdrop} onClick={onClose} />}

      {/* Session history dropdown (portal-like, outside panel so it can overlap) */}
      {isOpen && showHistory && sessions.length > 0 && (
        <div className={s.historyDropdown}>
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

      {/* Panel */}
      <div className={`${s.panel} ${isOpen ? s.panelOpen : ''}`}>

        {/* Header */}
        <div className={s.panelHeader}>
          <span className={s.abbySpark}><SparkleSmall /></span>
          <span className={s.abbytitle}>Abby</span>
          {pageContext && (
            <span className={s.pageBadge} title={pageContext}>{pageContext}</span>
          )}
          <div className={s.headerActions}>
            {messages.length > 0 && (
              <button
                className={s.iconBtn}
                onClick={clearConversation}
                title="New conversation"
              >
                <NewChatIcon />
              </button>
            )}
            {sessions.length > 0 && (
              <button
                className={s.iconBtn}
                onClick={() => setShowHistory(h => !h)}
                title="Conversation history"
              >
                <HistoryIcon />
              </button>
            )}
            <button className={s.iconBtn} onClick={onClose} title="Close Abby">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={s.messages}>
          {showWelcome && (
            <>
              <div className={s.welcome}>
                <div className={s.avatar}>A</div>
                <div className={s.welcomeTitle}>Hi, I'm Abby</div>
                <p className={s.welcomeText}>
                  I can help you explore Medicare data — comparing hospitals, finding quality leaders,
                  analyzing costs, and uncovering patterns across 5,400+ facilities.
                </p>
                {pageContext && (
                  <div className={s.contextNote}>
                    📍 I can see you're on the <strong>{pageContext}</strong> page —
                    ask me anything about the data shown here.
                  </div>
                )}
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
            <div key={i} className={`${s.message} ${msg.role === 'user' ? s.messageUser : ''}`}>
              <div className={`${s.msgAvatar} ${msg.role === 'user' ? s.msgAvatarUser : s.msgAvatarAbby}`}>
                {msg.role === 'user' ? 'U' : 'A'}
              </div>
              <div className={`${s.bubble} ${msg.role === 'user' ? s.bubbleUser : s.bubbleAssistant}`}>
                {msg.role === 'user'
                  ? msg.content
                  : <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                }
              </div>
            </div>
          ))}

          {isLoading && statusText && (
            <div className={s.toolIndicator}>
              <span className={s.pulse} />
              {statusText}
            </div>
          )}

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
            placeholder={pageContext
              ? `Ask about ${pageContext}...`
              : 'Ask Abby about Medicare data...'
            }
            disabled={isLoading}
            rows={1}
          />
          <button
            className={s.sendBtn}
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            title="Send"
          >
            <SendIcon />
          </button>
        </div>

        <div className={s.disclaimer}>
          CMS 2023 Medicare data · Informational only — not medical advice
        </div>
      </div>
    </>
  );
}

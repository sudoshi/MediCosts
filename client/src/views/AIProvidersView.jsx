import { useState, useEffect, useCallback } from 'react';
import s from './AIProvidersView.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const PROVIDER_META = {
  anthropic: {
    color: '#d97706',
    hint: 'sk-ant-...',
    modelToolHints: ['claude-haiku-4-5-20251001', 'claude-haiku-4-5'],
    modelSynthHints: ['claude-sonnet-4-6', 'claude-opus-4-6'],
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    color: '#10b981',
    hint: 'sk-...',
    modelToolHints: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    modelSynthHints: ['gpt-4o', 'gpt-4-turbo'],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    color: '#3b82f6',
    hint: 'AIza...',
    modelToolHints: ['gemini-1.5-flash', 'gemini-2.0-flash'],
    modelSynthHints: ['gemini-1.5-pro', 'gemini-2.0-pro'],
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  ollama: {
    color: '#8b5cf6',
    hint: null,
    modelToolHints: ['llama3.2', 'llama3.1', 'mistral', 'phi3'],
    modelSynthHints: ['llama3.2', 'llama3.1', 'mistral', 'phi3'],
    docsUrl: 'https://ollama.com/library',
  },
};

function Toast({ msg, type, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [msg, onDismiss]);
  if (!msg) return null;
  return (
    <div className={`${s.toast} ${type === 'error' ? s.toastError : s.toastOk}`}>
      {msg}
    </div>
  );
}

function ProviderCard({ provider, onRefresh, token }) {
  const meta = PROVIDER_META[provider.provider] || {};
  const [apiKey, setApiKey] = useState('');
  const [modelTool, setModelTool] = useState(provider.modelTool);
  const [modelSynth, setModelSynth] = useState(provider.modelSynth);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'ok') => setToast({ msg, type });

  // Load Ollama model list
  useEffect(() => {
    if (provider.provider !== 'ollama') return;
    fetch(`${API_BASE}/ai-providers/ollama/models`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.models) setOllamaModels(d.models); })
      .catch(() => {});
  }, [provider.provider, token]);

  async function saveKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/ai-providers/${provider.provider}/key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setApiKey('');
      showToast('API key saved');
      onRefresh();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      const r = await fetch(`${API_BASE}/ai-providers/${provider.provider}/activate`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      showToast(`${provider.label} is now active`);
      onRefresh();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActivating(false);
    }
  }

  async function saveModels() {
    setSavingModels(true);
    try {
      const r = await fetch(`${API_BASE}/ai-providers/${provider.provider}/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modelTool, modelSynth }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      showToast('Models updated');
      onRefresh();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSavingModels(false);
    }
  }

  const canActivate = provider.provider === 'ollama' || provider.hasKey;
  const accentColor = meta.color || 'var(--accent)';

  return (
    <div className={`${s.card} ${provider.isActive ? s.cardActive : ''}`}
      style={{ '--card-accent': accentColor }}>

      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}

      <div className={s.cardHeader}>
        <div className={s.cardTitle}>
          <span className={s.dot} style={{ background: accentColor }} />
          {provider.label}
        </div>
        {provider.isActive && <span className={s.activeBadge}>ACTIVE</span>}
      </div>

      {/* API Key section */}
      {provider.provider !== 'ollama' ? (
        <div className={s.section}>
          <label className={s.label}>API Key</label>
          <div className={s.keyRow}>
            <input
              className={s.input}
              type="password"
              placeholder={provider.keyMasked || meta.hint || 'Enter API key'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveKey()}
            />
            <button className={s.btnSave} onClick={saveKey} disabled={saving || !apiKey.trim()}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
          {provider.keyMasked && (
            <div className={s.keyHint}>Current: <code>{provider.keyMasked}</code></div>
          )}
          {meta.docsUrl && (
            <a className={s.docsLink} href={meta.docsUrl} target="_blank" rel="noreferrer">
              Get API key ↗
            </a>
          )}
        </div>
      ) : (
        <div className={s.section}>
          <div className={s.ollamaNote}>
            No API key required — runs locally on your machine.
            {ollamaModels.length > 0 && (
              <span className={s.ollamaModelCount}>{ollamaModels.length} models available</span>
            )}
          </div>
          {ollamaModels.length === 0 && (
            <div className={s.keyHint} style={{ color: 'var(--text-secondary)' }}>
              Ollama not detected — install from <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>
            </div>
          )}
        </div>
      )}

      {/* Models section */}
      <div className={s.section}>
        <label className={s.label}>Models</label>
        <div className={s.modelGrid}>
          <div>
            <div className={s.modelLabel}>Tool / fast</div>
            {provider.provider === 'ollama' && ollamaModels.length > 0 ? (
              <select className={s.select} value={modelTool} onChange={e => setModelTool(e.target.value)}>
                {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                className={s.input}
                type="text"
                value={modelTool}
                onChange={e => setModelTool(e.target.value)}
                list={`hints-tool-${provider.provider}`}
              />
            )}
            {meta.modelToolHints && (
              <datalist id={`hints-tool-${provider.provider}`}>
                {meta.modelToolHints.map(h => <option key={h} value={h} />)}
              </datalist>
            )}
          </div>
          <div>
            <div className={s.modelLabel}>Synthesis / slow</div>
            {provider.provider === 'ollama' && ollamaModels.length > 0 ? (
              <select className={s.select} value={modelSynth} onChange={e => setModelSynth(e.target.value)}>
                {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input
                className={s.input}
                type="text"
                value={modelSynth}
                onChange={e => setModelSynth(e.target.value)}
                list={`hints-synth-${provider.provider}`}
              />
            )}
            {meta.modelSynthHints && (
              <datalist id={`hints-synth-${provider.provider}`}>
                {meta.modelSynthHints.map(h => <option key={h} value={h} />)}
              </datalist>
            )}
          </div>
        </div>
        <button
          className={s.btnSecondary}
          onClick={saveModels}
          disabled={savingModels}
          style={{ marginTop: 8 }}
        >
          {savingModels ? 'Saving…' : 'Save Models'}
        </button>
      </div>

      {/* Activate button */}
      <div className={s.cardFooter}>
        {provider.isActive ? (
          <div className={s.activeNote}>Currently serving Abby requests</div>
        ) : (
          <button
            className={s.btnActivate}
            onClick={activate}
            disabled={!canActivate || activating}
            style={{ '--btn-color': accentColor }}
          >
            {activating ? (
              <><span className={s.spinner} /> Activating…</>
            ) : canActivate ? (
              'Set as Active'
            ) : (
              'Save API key first'
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AIProvidersView() {
  const token = localStorage.getItem('authToken');
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/ai-providers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        setProviders(d.providers || []);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const active = providers.find(p => p.isActive);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>AI Provider Settings</h1>
          <p className={s.subtitle}>
            Configure the AI model powering Abby Analytics.
            {active && (
              <> Currently active: <strong style={{ color: PROVIDER_META[active.provider]?.color }}>{active.label}</strong> ({active.modelTool})</>
            )}
          </p>
        </div>
        <span className={s.adminBadge}>Admin</span>
      </div>

      {loading && <div className={s.loading}>Loading providers…</div>}
      {error && <div className={s.errorMsg}>Error: {error}</div>}

      {!loading && !error && (
        <div className={s.grid}>
          {providers.map(p => (
            <ProviderCard key={p.provider} provider={p} onRefresh={load} token={token} />
          ))}
        </div>
      )}

      <div className={s.infoBox}>
        <strong>How it works:</strong> API keys are encrypted (AES-256-GCM) in the database using a key derived from your JWT secret. Only one provider is active at a time. Changes take effect within 60 seconds for streaming requests.
      </div>
    </div>
  );
}

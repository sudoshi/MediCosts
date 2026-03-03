import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Global logout callback — set by App.jsx
let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('authToken');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_BASE}${path}`, { headers })
      .then((r) => {
        if (r.status === 401) {
          _onUnauthorized?.();
          throw new Error('Unauthorized');
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

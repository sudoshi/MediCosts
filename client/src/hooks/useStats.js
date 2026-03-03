/**
 * useStats — fetches /api/stats with localStorage caching (24-hour TTL).
 *
 * The server computes stats fresh on startup and refreshes nightly after
 * crawlers finish enriching the database. This hook mirrors that with a
 * client-side cache so every page navigation doesn't re-request the endpoint.
 */

import { useState, useEffect } from 'react';

const CACHE_KEY = 'medicosts_stats';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function fmtBig(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return Math.round(n / 1e6) + 'M+';
  if (n >= 1e3) return Math.round(n / 1e3).toLocaleString() + 'K+';
  return n.toLocaleString();
}

function fmtDollars(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + Math.round(n / 1e6) + 'M';
  return '$' + n.toLocaleString();
}

export default function useStats() {
  const [stats, setStats] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.data;
      }
    } catch { /* ignore parse errors */ }
    return null;
  });

  useEffect(() => {
    // Check if the in-memory state already came from a fresh cache
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
    } catch { /* ignore */ }

    fetch(`${API_BASE}/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setStats(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
      })
      .catch(() => { /* non-fatal — static fallbacks remain */ });
  }, []);

  // Formatted convenience values derived from raw stats
  const fmt = stats ? {
    totalRecords:         fmtBig(stats.total_records),
    openPayments:         fmtBig(stats.open_payments),
    openPaymentsDollars:  fmtDollars(stats.open_payments_dollars),
    clinicians:           fmtBig(stats.clinicians),
    hospitals:            stats.hospitals?.toLocaleString() + '+',
    physicianServices:    fmtBig(stats.physician_services),
    partDPrescribers:     fmtBig(stats.part_d_prescribers),
    computedAt:           stats.computed_at,
  } : null;

  return { stats, fmt };
}

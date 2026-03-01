export const DOMAIN_COLORS = {
  clinical:    { main: '#3b82f6', dim: 'rgba(59, 130, 246, 0.12)' },
  safety:      { main: '#ef4444', dim: 'rgba(239, 68, 68, 0.12)' },
  operational: { main: '#22c55e', dim: 'rgba(34, 197, 94, 0.12)' },
  quality:     { main: '#a78bfa', dim: 'rgba(167, 139, 250, 0.12)' },
  financial:   { main: '#f59e0b', dim: 'rgba(245, 158, 11, 0.12)' },
};

export function comparisonColor(text) {
  if (!text) return '#71717a';
  const lower = text.toLowerCase();
  if (lower.includes('worse')) return '#ef4444';
  if (lower.includes('better')) return '#22c55e';
  if (lower.includes('no different') || lower.includes('same')) return '#71717a';
  return '#71717a';
}

export function comparisonBadge(text) {
  if (!text) return { label: 'N/A', variant: 'neutral' };
  const lower = text.toLowerCase();
  if (lower.includes('worse')) return { label: 'Worse', variant: 'worse' };
  if (lower.includes('better')) return { label: 'Better', variant: 'better' };
  if (lower.includes('no different')) return { label: 'Same', variant: 'same' };
  return { label: text, variant: 'neutral' };
}

export function sirColor(sir) {
  if (sir == null) return '#71717a';
  if (sir < 0.7) return '#22c55e';
  if (sir < 1.0) return '#f59e0b';
  return '#ef4444';
}

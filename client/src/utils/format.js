export const fmtCurrency = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const fmtNumber = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-US');

export const fmtPercent = (n) =>
  n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`;

export const fmtStars = (n) => {
  if (n == null) return '—';
  const rating = Math.round(Number(n));
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
};

export const fmtIncome = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const fmtSIR = (n) =>
  n == null ? '—' : Number(n).toFixed(3);

export const fmtRate = (n) =>
  n == null ? '—' : `${Number(n).toFixed(1)}%`;

export const fmtMinutes = (n) =>
  n == null ? '—' : `${Math.round(Number(n))} min`;

export const fmtRatio = (n) =>
  n == null ? '—' : Number(n).toFixed(4);

export const fmtCompact = (n) => {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

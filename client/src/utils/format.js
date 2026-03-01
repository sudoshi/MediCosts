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

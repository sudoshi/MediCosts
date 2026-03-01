export const fmtCurrency = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const fmtNumber = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-US');

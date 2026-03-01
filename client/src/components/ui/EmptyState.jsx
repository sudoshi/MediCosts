import s from './EmptyState.module.css';

const ICONS = {
  search: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  ),
  data: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  ),
  connector: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 2v6m0 8v6M2 12h6m8 0h6" /><circle cx="12" cy="12" r="4" />
    </svg>
  ),
};

export default function EmptyState({ icon = 'data', title, message, action }) {
  return (
    <div className={s.empty}>
      <div className={s.iconWrap}>{ICONS[icon] || ICONS.data}</div>
      <h3 className={s.title}>{title || 'No data available'}</h3>
      {message && <p className={s.message}>{message}</p>}
      {action && (
        <button className={s.action} onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}

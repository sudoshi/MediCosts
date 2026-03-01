import { useRef } from 'react';
import Badge from '../ui/Badge.jsx';
import s from './ConnectorCard.module.css';

const STATUS_BADGE = {
  active: 'better',
  inactive: 'neutral',
  syncing: 'info',
  error: 'worse',
};

const CSV_TYPES = ['csv', 'definitive', 'vizient', 'premier'];

export default function ConnectorCard({ connector, onTest, onSync, onDelete }) {
  const c = connector;
  const timeSince = c.last_sync_at ? timeAgo(c.last_sync_at) : null;
  const isCsv = CSV_TYPES.includes(c.type);
  const fileRef = useRef(null);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onSync(c.id, file);
    e.target.value = '';
  }

  return (
    <div className={s.card}>
      <div className={s.header}>
        <div className={s.info}>
          <span className={s.type}>{c.type.toUpperCase()}</span>
          <span className={s.name}>{c.name}</span>
        </div>
        <Badge variant={STATUS_BADGE[c.status] || 'neutral'}>{c.status}</Badge>
      </div>
      {timeSince && <span className={s.syncTime}>Last sync: {timeSince}</span>}
      {c.last_error && <span className={s.error}>{c.last_error}</span>}
      <div className={s.actions}>
        <button className={s.btn} onClick={() => onTest(c.id)} disabled={c.status === 'syncing'}>Test</button>
        {isCsv ? (
          <>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv" hidden onChange={handleFileUpload} />
            <button
              className={`${s.btn} ${s.btnPrimary}`}
              onClick={() => fileRef.current?.click()}
              disabled={c.status === 'syncing'}
            >
              {c.status === 'syncing' ? 'Uploading...' : 'Upload File'}
            </button>
          </>
        ) : (
          <button className={`${s.btn} ${s.btnPrimary}`} onClick={() => onSync(c.id)} disabled={c.status === 'syncing'}>
            {c.status === 'syncing' ? 'Syncing...' : 'Sync'}
          </button>
        )}
        <button className={`${s.btn} ${s.btnDanger}`} onClick={() => onDelete(c.id)}>Remove</button>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

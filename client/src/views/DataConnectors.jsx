import { useState, useCallback, useEffect } from 'react';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import ConnectorCard from '../components/connectors/ConnectorCard.jsx';
import AddConnectorModal from '../components/connectors/AddConnectorModal.jsx';
import s from './DataConnectors.module.css';

const API = import.meta.env.VITE_API_URL || '/api';

const authHeaders = (extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${localStorage.getItem('authToken')}`,
});

const PUBLIC_SOURCES = [
  { name: 'Medicare Inpatient DRGs', records: '~190K rows' },
  { name: 'Hospital General Info', records: '~5,300 hospitals' },
  { name: 'HCAHPS Patient Survey', records: '~265K rows' },
  { name: 'Medicare Outpatient', records: '~160K rows' },
  { name: 'Medicare Physician', records: '~9.66M rows' },
  { name: 'Census Demographics', records: '~33K ZCTAs' },
  { name: 'NHSN HAI Infections', records: '~172K rows' },
  { name: 'Hospital Readmissions (HRRP)', records: '~18K rows' },
  { name: 'Patient Safety (HAC)', records: '~3K hospitals' },
  { name: 'Timely & Effective Care', records: '~138K rows' },
  { name: 'Complications & Deaths', records: '~96K rows' },
  { name: 'Payment & Value of Care', records: '~18K rows' },
];

export default function DataConnectors() {
  const [connectors, setConnectors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch(`${API}/connectors`, { headers: authHeaders() });
      const json = await res.json();
      setConnectors(json);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  async function handleCreate(data) {
    const res = await fetch(`${API}/connectors`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create connector');
    setMessage({ type: 'success', text: 'Connector created successfully' });
    await fetchConnectors();
  }

  async function handleTest(id) {
    setMessage(null);
    try {
      const res = await fetch(`${API}/connectors/${id}/test`, { method: 'POST', headers: authHeaders() });
      const json = await res.json();
      setMessage({ type: json.ok ? 'success' : 'error', text: json.message });
      await fetchConnectors();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  async function handleSync(id, file) {
    setMessage(null);
    try {
      await fetchConnectors(); // Refresh to show "syncing"
      let res;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        res = await fetch(`${API}/connectors/${id}/sync`, { method: 'POST', headers: authHeaders(), body: form });
      } else {
        res = await fetch(`${API}/connectors/${id}/sync`, { method: 'POST', headers: authHeaders() });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setMessage({ type: 'success', text: json.message || `Imported ${json.records} records` });
      await fetchConnectors();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      await fetchConnectors();
    }
  }

  async function handleDelete(id) {
    try {
      await fetch(`${API}/connectors/${id}`, { method: 'DELETE', headers: authHeaders() });
      setMessage({ type: 'success', text: 'Connector removed' });
      await fetchConnectors();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Data Connectors</h1>
        <p className={s.subtitle}>Public CMS data sources and external data integrations</p>
      </header>

      {message && (
        <div className={`${s.toast} ${message.type === 'error' ? s.toastError : s.toastSuccess}`}>
          {message.text}
          <button className={s.toastClose} onClick={() => setMessage(null)}>&times;</button>
        </div>
      )}

      <Panel title="Public Data Sources (Auto-Loaded)">
        <div className={s.sourceGrid}>
          {PUBLIC_SOURCES.map((src, i) => (
            <div key={src.name} className={s.sourceCard} style={{ '--i': i }}>
              <div className={s.sourceStatus}>
                <span className={s.statusDot} />
                <Badge variant="better">Loaded</Badge>
              </div>
              <span className={s.sourceName}>{src.name}</span>
              <span className={s.sourceRecords}>{src.records}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Connected Sources">
        <div className={s.connectedHeader}>
          <p className={s.connectorHint}>
            {connectors.length === 0 ? 'No external connectors configured yet.' : `${connectors.length} connector(s) configured`}
          </p>
          <button className={s.addBtn} onClick={() => setShowModal(true)}>+ Add Connector</button>
        </div>
        {connectors.length > 0 && (
          <div className={s.connectorList}>
            {connectors.map((c) => (
              <ConnectorCard key={c.id} connector={c} onTest={handleTest} onSync={handleSync} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </Panel>

      <AddConnectorModal open={showModal} onClose={() => setShowModal(false)} onSubmit={handleCreate} />
    </div>
  );
}

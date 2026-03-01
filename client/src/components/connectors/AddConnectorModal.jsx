import { useState } from 'react';
import s from './AddConnectorModal.module.css';

const TYPES = [
  { value: 'fhir', label: 'FHIR R4', desc: 'Connect to an EHR (Epic, Cerner, HAPI)' },
  { value: 'omop', label: 'OMOP CDM', desc: 'Query an OMOP database' },
  { value: 'csv', label: 'CSV Upload', desc: 'Upload a CSV or Excel file' },
  { value: 'definitive', label: 'Definitive HC', desc: 'Import Definitive Healthcare data' },
  { value: 'vizient', label: 'Vizient', desc: 'Import Vizient benchmarking data' },
  { value: 'premier', label: 'Premier', desc: 'Import Premier analytics data' },
];

export default function AddConnectorModal({ open, onClose, onSubmit }) {
  const [step, setStep] = useState('type');
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function handleTypeSelect(t) {
    setType(t);
    setName(`${TYPES.find((x) => x.value === t)?.label || t} Connector`);
    setStep('config');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ name, type, config });
      onClose();
      setStep('type');
      setType('');
      setName('');
      setConfig({});
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <h3 className={s.modalTitle}>{step === 'type' ? 'Choose Connector Type' : `Configure ${type.toUpperCase()}`}</h3>
          <button className={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {step === 'type' && (
          <div className={s.typeGrid}>
            {TYPES.map((t) => (
              <button key={t.value} className={s.typeCard} onClick={() => handleTypeSelect(t.value)}>
                <span className={s.typeLabel}>{t.label}</span>
                <span className={s.typeDesc}>{t.desc}</span>
              </button>
            ))}
          </div>
        )}

        {step === 'config' && (
          <form className={s.form} onSubmit={handleSubmit}>
            <div className={s.field}>
              <label className={s.label}>Name</label>
              <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            {type === 'fhir' && (
              <>
                <div className={s.field}>
                  <label className={s.label}>FHIR Base URL</label>
                  <input className={s.input} placeholder="https://hapi.fhir.org/baseR4"
                    value={config.baseUrl || ''} onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })} required />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Token Endpoint <span className={s.optional}>(optional)</span></label>
                  <input className={s.input} placeholder="https://auth.example.com/token"
                    value={config.tokenEndpoint || ''} onChange={(e) => setConfig({ ...config, tokenEndpoint: e.target.value })} />
                </div>
                <div className={s.fieldRow}>
                  <div className={s.field}>
                    <label className={s.label}>Client ID</label>
                    <input className={s.input} value={config.clientId || ''} onChange={(e) => setConfig({ ...config, clientId: e.target.value })} />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Client Secret</label>
                    <input className={s.input} type="password" value={config.clientSecret || ''} onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            {type === 'omop' && (
              <>
                <div className={s.fieldRow}>
                  <div className={s.field}>
                    <label className={s.label}>Host</label>
                    <input className={s.input} placeholder="localhost" value={config.host || ''} onChange={(e) => setConfig({ ...config, host: e.target.value })} required />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Port</label>
                    <input className={s.input} type="number" placeholder="5432" value={config.port || ''} onChange={(e) => setConfig({ ...config, port: e.target.value })} />
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Database</label>
                  <input className={s.input} value={config.database || ''} onChange={(e) => setConfig({ ...config, database: e.target.value })} required />
                </div>
                <div className={s.fieldRow}>
                  <div className={s.field}>
                    <label className={s.label}>User</label>
                    <input className={s.input} value={config.user || ''} onChange={(e) => setConfig({ ...config, user: e.target.value })} required />
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>Password</label>
                    <input className={s.input} type="password" value={config.password || ''} onChange={(e) => setConfig({ ...config, password: e.target.value })} />
                  </div>
                </div>
                <div className={s.field}>
                  <label className={s.label}>CDM Schema</label>
                  <input className={s.input} placeholder="cdm" value={config.schema || ''} onChange={(e) => setConfig({ ...config, schema: e.target.value })} />
                </div>
              </>
            )}

            {['csv', 'definitive', 'vizient', 'premier'].includes(type) && (
              <div className={s.csvNote}>
                <p>This connector will be created for CSV/Excel uploads. Use the "Sync" button after creation to upload files.</p>
              </div>
            )}

            <div className={s.formActions}>
              <button type="button" className={s.cancelBtn} onClick={() => { setStep('type'); setConfig({}); }}>Back</button>
              <button type="submit" className={s.submitBtn} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Connector'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Panel from '../components/Panel.jsx';
import { apiFetch } from '../utils/api.js';
import s from './ConsumerWorkspace.module.css';

const CASE_TYPES = [
  ['bill_check', 'Bill check'],
  ['complaint', 'Complaint'],
  ['medical_debt', 'Medical debt'],
  ['coverage_issue', 'Coverage issue'],
  ['plan_outcome', 'Plan outcome evidence'],
  ['care_estimate', 'Care estimate'],
  ['general_advocacy', 'General advocacy'],
];

export default function MyCases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    caseType: 'bill_check',
    title: '',
    state: '',
    priority: 'normal',
  });

  useEffect(() => {
    loadCases();
  }, []);

  async function loadCases() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/cases');
      setCases(data.cases || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createCase(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await apiFetch('/cases', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          status: 'needs_release',
          title: form.title || undefined,
        }),
      });
      navigate(`/cases/${data.case.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>Cases</p>
          <h1 className={s.title}>My cases</h1>
          <p className={s.subtitle}>
            Track healthcare cost issues and keep documents tied to a signed release.
          </p>
        </div>
      </header>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.grid}>
        <Panel title="Create Case">
          <form className={s.form} onSubmit={createCase}>
            <div className={s.field}>
              <label className={s.label}>Case type</label>
              <select
                className={s.select}
                value={form.caseType}
                onChange={e => setForm(f => ({ ...f, caseType: e.target.value }))}
              >
                {CASE_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>Title</label>
              <input
                className={s.input}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g., ER bill from May visit"
              />
            </div>
            <div className={s.formRow}>
              <div className={s.field}>
                <label className={s.label}>State</label>
                <input
                  className={s.input}
                  value={form.state}
                  maxLength={2}
                  onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                  placeholder="CA"
                />
              </div>
              <div className={s.field}>
                <label className={s.label}>Priority</label>
                <select
                  className={s.select}
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <button className={s.primaryButton} disabled={saving}>
              {saving ? 'Creating...' : 'Create Case'}
            </button>
          </form>
        </Panel>

        <Panel title="Case List">
          {loading ? (
            <div className={s.empty}>Loading cases...</div>
          ) : cases.length ? (
            <div className={s.caseList}>
              {cases.map(item => (
                <Link key={item.id} to={`/cases/${item.id}`} className={s.caseItem}>
                  <div>
                    <h3 className={s.caseTitle}>{item.title}</h3>
                    <div className={s.caseMeta}>
                      <span>{label(item.caseType)}</span>
                      <span>{label(item.status)}</span>
                      {item.state && <span>{item.state}</span>}
                    </div>
                  </div>
                  <span className={item.priority === 'urgent' ? s.warningBadge : s.badge}>
                    {item.priority}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={s.empty}>No cases yet.</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

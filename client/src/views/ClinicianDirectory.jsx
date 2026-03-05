import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './ClinicianDirectory.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const keys = ['npi', 'last_name', 'first_name', 'credential', 'primary_specialty', 'city', 'state', 'facility_name'];
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

export default function ClinicianDirectory() {
  const navigate = useNavigate();
  const [nameQuery, setNameQuery] = useState('');
  const [state, setState] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const { data: specialties } = useApi('/clinicians/specialties', []);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    // Need at least one filter
    if (!nameQuery && !state && !specialty) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const params = new URLSearchParams();
      if (nameQuery) params.set('q', nameQuery);
      if (state) params.set('state', state);
      if (specialty) params.set('specialty', specialty);
      params.set('limit', '100');

      setLoading(true);
      fetch(`${API_BASE}/clinicians/search?${params}`, { signal: ctrl.signal })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (!ctrl.signal.aborted) setResults(data);
        })
        .catch(e => {
          if (e.name !== 'AbortError') setResults([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [nameQuery, state, specialty]);

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Clinician Directory</h1>
        <p className={s.subtitle}>2.7M+ Medicare-enrolled physicians and practitioners</p>
      </header>

      <div className={s.toolbar}>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Name</span>
          <input className={s.searchInput} placeholder="Search by name…"
            value={nameQuery} onChange={e => setNameQuery(e.target.value)} />
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>State</span>
          <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Specialty</span>
          <select className={s.select} value={specialty} onChange={e => setSpecialty(e.target.value)}>
            <option value="">All Specialties</option>
            {(specialties || []).map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </select>
        </div>
      </div>

      <Panel
        title="Search Results"
        headerRight={results?.length > 0 && (
          <button
            onClick={() => exportCsv(results, `clinicians-${state||'all'}-${specialty||'all'}.csv`)}
            style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-dim)', borderRadius: 5, color: 'var(--text-secondary)', fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >↓ CSV</button>
        )}
      >
        {loading ? <Skeleton height={400} /> : results === null ? (
          <p className={s.emptyMsg}>Enter a name, select a state, or choose a specialty to search.</p>
        ) : results.length === 0 ? (
          <p className={s.emptyMsg}>No clinicians found matching your criteria.</p>
        ) : (
          <>
            <p className={s.resultCount}>{results.length >= 100 ? '100+ results (showing first 100)' : `${results.length} results`}</p>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Credential</th>
                    <th>Specialty</th>
                    <th>City</th>
                    <th>State</th>
                    <th>Telehealth</th>
                    <th>Facility</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={`${r.npi}-${i}`} className={s.clickableRow} onClick={() => navigate(`/clinicians/${r.npi}`)}>
                      <td className={s.name}>{r.last_name}, {r.first_name}</td>
                      <td className={s.credential}>{r.credential || '—'}</td>
                      <td className={s.specialty}>{r.primary_specialty}</td>
                      <td>{r.city}</td>
                      <td>{r.state}</td>
                      <td>{r.telehealth ? <span className={s.teleBadge}>Telehealth</span> : '—'}</td>
                      <td className={s.facility}>{r.facility_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

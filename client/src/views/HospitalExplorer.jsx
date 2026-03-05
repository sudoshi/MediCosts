import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchInput from '../components/ui/SearchInput.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars } from '../utils/format.js';
import s from './HospitalExplorer.module.css';

const API = import.meta.env.VITE_API_URL || '/api';
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

function exportCsv(rows, filename) {
  if (!rows.length) return;
  const keys = ['facility_name','city','state','star_rating','psi_90_score','avg_excess_readm_ratio','weighted_avg_payment'];
  const labels = ['Hospital','City','State','Stars','PSI-90','Readm Ratio','Avg Payment'];
  const csv = [labels.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

export default function HospitalExplorer() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [minStars, setMinStars] = useState(0);
  const [sort, setSort] = useState('facility_name');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState(null);
  const [hcahpsMap, setHcahpsMap] = useState({});

  const perPage = 50;

  // Paginated hospital list
  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage, sort, order });
      if (stateFilter) params.set('state', stateFilter);
      if (minStars > 0) params.set('min_stars', minStars);
      const res = await fetch(`${API}/quality/hospitals?${params}`);
      const json = await res.json();
      setData(json);
    } catch { setData(null); }
    setLoading(false);
  }, [page, sort, order, stateFilter, minStars]);

  useEffect(() => { fetchHospitals(); }, [fetchHospitals]);

  // Fetch HCAHPS data for current state filter
  useEffect(() => {
    const params = stateFilter ? `?state=${stateFilter}` : '';
    fetch(`${API}/quality/hcahps/by-hospital${params}`)
      .then(r => r.json())
      .then(rows => {
        const map = {};
        for (const r of rows) map[r.facility_id] = r;
        setHcahpsMap(map);
      })
      .catch(() => {});
  }, [stateFilter]);

  // Search autocomplete
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults(null); return; }
    const controller = new AbortController();
    fetch(`${API}/quality/search?q=${encodeURIComponent(search)}&limit=20`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setSearchResults)
      .catch(() => {});
    return () => controller.abort();
  }, [search]);

  function handleSort(col) {
    if (sort === col) setOrder((o) => o === 'asc' ? 'desc' : 'asc');
    else { setSort(col); setOrder('desc'); }
    setPage(1);
  }

  function handleStateChange(e) {
    setStateFilter(e.target.value);
    setPage(1);
  }

  function handleMinStarsChange(e) {
    setMinStars(Number(e.target.value));
    setPage(1);
  }

  const totalPages = data ? Math.ceil(data.total / perPage) : 0;
  const hospitals = searchResults || data?.data || [];
  const showingSearch = searchResults !== null;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Hospital Explorer</h1>
        <p className={s.subtitle}>{data?.total?.toLocaleString() || '—'} hospitals with quality metrics</p>
      </header>

      <div className={s.toolbar}>
        <div className={s.searchWrap}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search hospitals by name..." debounceMs={250} />
          {showingSearch && (
            <span className={s.searchHint}>{searchResults.length} results — <button className={s.clearSearch} onClick={() => { setSearch(''); setSearchResults(null); }}>clear search</button></span>
          )}
        </div>
        <select className={s.select} value={stateFilter} onChange={handleStateChange}>
          <option value="">All States</option>
          {STATES.map((st) => <option key={st} value={st}>{st}</option>)}
        </select>
        <select className={s.select} value={minStars} onChange={handleMinStarsChange} title="Minimum star rating">
          <option value={0}>Any Stars</option>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+ Stars</option>)}
        </select>
        <button className={s.exportBtn} onClick={() => exportCsv(hospitals, `hospitals-${stateFilter || 'all'}.csv`)} title="Export CSV">
          ↓ CSV
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {[
                { key: 'facility_name', label: 'Hospital', align: 'left' },
                { key: 'state', label: 'State', align: 'center' },
                { key: 'star_rating', label: 'Stars', align: 'center' },
                { key: 'patient_rating', label: 'Patient Rating', align: 'center', noSort: true },
                { key: 'psi_90_score', label: 'PSI-90', align: 'right' },
                { key: 'avg_excess_readm_ratio', label: 'Readm Ratio', align: 'right' },
                { key: 'weighted_avg_payment', label: 'Avg Payment', align: 'right' },
              ].map((col) => (
                <th key={col.key} style={{ textAlign: col.align }} className={`${s.th} ${sort === col.key ? s.sorted : ''}`}
                  onClick={() => !showingSearch && !col.noSort && handleSort(col.key)}>
                  {col.label}
                  {sort === col.key && !showingSearch && <span className={s.arrow}>{order === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}><td colSpan={7}><Skeleton height={18} /></td></tr>
              ))
            ) : hospitals.length === 0 ? (
              <tr><td colSpan={7} className={s.empty}>No hospitals found</td></tr>
            ) : (
              hospitals.map((h) => {
                const hc = hcahpsMap[h.facility_id];
                return (
                  <tr key={h.facility_id} className={s.row} onClick={() => navigate(`/hospitals/${h.facility_id}`)}>
                    <td className={s.name}>
                      <span className={s.facilityName}>{h.facility_name}</span>
                      {h.city && <span className={s.city}>{h.city}</span>}
                    </td>
                    <td className={s.center}>{h.state}</td>
                    <td className={s.center}>
                      <span className={s.stars}>{fmtStars(h.star_rating || h.hospital_overall_rating)}</span>
                    </td>
                    <td className={s.center}>
                      <span className={s.stars}>{hc ? fmtStars(hc.overall_star) : '—'}</span>
                    </td>
                    <td className={s.mono}>{h.psi_90_score ? Number(h.psi_90_score).toFixed(3) : '—'}</td>
                    <td className={s.mono}>{h.avg_excess_readm_ratio ? Number(h.avg_excess_readm_ratio).toFixed(4) : '—'}</td>
                    <td className={s.mono}>{fmtCurrency(h.weighted_avg_payment)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!showingSearch && totalPages > 1 && (
        <div className={s.pagination}>
          <button className={s.pageBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className={s.pageInfo}>Page {page} of {totalPages}</span>
          <button className={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

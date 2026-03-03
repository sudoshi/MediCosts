import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtNumber, fmtStars } from '../utils/format.js';
import s from './CostEstimator.module.css';

const API = import.meta.env.VITE_API_URL || '/api';
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const RADII = [25, 50, 100, 200];

export default function CostEstimator() {
  const navigate = useNavigate();

  // DRG search
  const [drgQuery, setDrgQuery] = useState('');
  const [drgSuggestions, setDrgSuggestions] = useState([]);
  const [selectedDrg, setSelectedDrg] = useState(null); // {drg_cd, drg_desc, ...}
  const debounceRef = useRef(null);

  // Location
  const [locMode, setLocMode] = useState('zip'); // 'zip' | 'state'
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState(50);
  const [stateFilter, setStateFilter] = useState('');

  // Sort
  const [sort, setSort] = useState('payment');
  const [order, setOrder] = useState('asc');

  // Results
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // DRG autocomplete
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!drgQuery || drgQuery.length < 2) { setDrgSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      fetch(`${API}/drgs/search?q=${encodeURIComponent(drgQuery)}&limit=15`)
        .then(r => r.json())
        .then(setDrgSuggestions)
        .catch(() => setDrgSuggestions([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [drgQuery]);

  function selectDrg(drg) {
    setSelectedDrg(drg);
    setDrgQuery('');
    setDrgSuggestions([]);
    setResults(null);
    setSummary(null);
    setSearched(false);
    // Fetch national summary
    fetch(`${API}/drgs/${drg.drg_cd}/summary`)
      .then(r => r.json())
      .then(setSummary)
      .catch(() => {});
  }

  function clearDrg() {
    setSelectedDrg(null);
    setSummary(null);
    setResults(null);
    setSearched(false);
  }

  async function search() {
    if (!selectedDrg) return;
    setLoading(true);
    setSearched(true);
    const params = new URLSearchParams({
      drg: selectedDrg.drg_cd,
      sort,
      order,
      limit: '100',
    });
    if (locMode === 'zip' && zip.length === 5) {
      params.set('zip', zip);
      params.set('radius', radius);
    } else if (locMode === 'state' && stateFilter) {
      params.set('state', stateFilter);
    }
    try {
      const res = await fetch(`${API}/estimate?${params}`);
      const data = await res.json();
      setResults(data);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }

  // Re-search when sort changes (if we've already searched)
  useEffect(() => {
    if (searched && selectedDrg) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, order]);

  const hasZip = locMode === 'zip' && zip.length === 5;

  // Shortage area check for entered ZIP
  const [shortageData, setShortageData] = useState(null);
  useEffect(() => {
    if (!hasZip) { setShortageData(null); return; }
    const token = localStorage.getItem('authToken');
    fetch(`${API}/shortage-areas?zip=${zip}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setShortageData(d?.shortage_areas?.length ? d : null))
      .catch(() => {});
  }, [zip, hasZip]); // eslint-disable-line react-hooks/exhaustive-deps

  function askAbby() {
    if (!results || results.length === 0 || !selectedDrg) return;
    const top5 = results.slice(0, 5);
    const context = [
      `I'm looking for: ${selectedDrg.drg_desc} (DRG ${selectedDrg.drg_cd})`,
      locMode === 'zip' ? `Near ZIP ${zip} within ${radius} miles` : stateFilter ? `In ${stateFilter}` : 'Nationwide',
      summary ? `National average: ${fmtCurrency(summary.avg_payment)}, range ${fmtCurrency(summary.min_payment)}–${fmtCurrency(summary.max_payment)}` : '',
      '',
      'Top results:',
      ...top5.map((h, i) =>
        `${i + 1}. ${h.facility_name} (${h.city}, ${h.state}) — ${fmtCurrency(h.avg_total_payments)}` +
        (h.distance_miles ? `, ${h.distance_miles} mi` : '') +
        (h.star_rating ? `, ${h.star_rating}★` : '')
      ),
    ].filter(Boolean).join('\n');

    navigate('/abby', { state: { estimatorContext: context } });
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Cost Estimator</h1>
        <p className={s.subtitle}>Find hospitals for any procedure — compare price, quality, and distance</p>
      </header>

      {/* Controls */}
      <Panel>
        <div className={s.controls}>
          {/* DRG Search */}
          <div className={s.field}>
            <label className={s.label}>Procedure</label>
            {selectedDrg ? (
              <div className={s.drgChip}>
                <span className={s.drgCode}>{selectedDrg.drg_cd}</span>
                <span className={s.drgName}>{selectedDrg.drg_desc}</span>
                <button className={s.drgRemove} onClick={clearDrg}>×</button>
              </div>
            ) : (
              <div className={s.searchWrap}>
                <input
                  className={s.input}
                  placeholder="Search procedures (e.g. knee replacement, heart failure)..."
                  value={drgQuery}
                  onChange={e => setDrgQuery(e.target.value)}
                  autoFocus
                />
                {drgSuggestions.length > 0 && (
                  <div className={s.dropdown}>
                    {drgSuggestions.map(d => (
                      <button key={d.drg_cd} className={s.dropItem} onClick={() => selectDrg(d)}>
                        <span className={s.dropCode}>{d.drg_cd}</span>
                        <span className={s.dropDesc}>{d.drg_desc}</span>
                        <span className={s.dropMeta}>
                          {fmtNumber(d.num_providers)} hospitals · {fmtNumber(d.total_discharges)} cases · avg {fmtCurrency(d.avg_payment)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Location */}
          <div className={s.field}>
            <label className={s.label}>Location</label>
            <div className={s.locRow}>
              <div className={s.toggleGroup}>
                <button
                  className={`${s.toggle} ${locMode === 'zip' ? s.toggleActive : ''}`}
                  onClick={() => setLocMode('zip')}
                >Near ZIP</button>
                <button
                  className={`${s.toggle} ${locMode === 'state' ? s.toggleActive : ''}`}
                  onClick={() => setLocMode('state')}
                >By State</button>
              </div>

              {locMode === 'zip' ? (
                <div className={s.locInputs}>
                  <input
                    className={s.inputSmall}
                    placeholder="ZIP code"
                    maxLength={5}
                    value={zip}
                    onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
                  />
                  <select className={s.select} value={radius} onChange={e => setRadius(Number(e.target.value))}>
                    {RADII.map(r => <option key={r} value={r}>{r} mi</option>)}
                  </select>
                </div>
              ) : (
                <select className={s.select} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
                  <option value="">All States</option>
                  {STATES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Sort + Search */}
          <div className={s.field}>
            <label className={s.label}>Sort by</label>
            <div className={s.sortRow}>
              <select className={s.select} value={sort} onChange={e => setSort(e.target.value)}>
                <option value="payment">Avg Payment</option>
                {hasZip && <option value="distance">Distance</option>}
                <option value="star">Star Rating</option>
                <option value="markup">Markup</option>
              </select>
              <button
                className={s.orderBtn}
                onClick={() => setOrder(o => o === 'asc' ? 'desc' : 'asc')}
                title={order === 'asc' ? 'Ascending' : 'Descending'}
              >
                {order === 'asc' ? '▲' : '▼'}
              </button>
              <button className={s.searchBtn} onClick={search} disabled={!selectedDrg || loading}>
                {loading ? 'Searching...' : 'Find Hospitals'}
              </button>
            </div>
          </div>
        </div>
      </Panel>

      {/* National Summary */}
      {summary && (
        <div className={s.summaryRow}>
          <SummaryCard label="National Average" value={fmtCurrency(summary.avg_payment)} />
          <SummaryCard label="Median" value={fmtCurrency(summary.median_payment)} />
          <SummaryCard label="Range" value={`${fmtCurrency(summary.min_payment)} – ${fmtCurrency(summary.max_payment)}`} />
          <SummaryCard label="Hospitals" value={fmtNumber(summary.num_providers)} />
          <SummaryCard label="Total Cases" value={fmtNumber(summary.total_discharges)} />
        </div>
      )}

      {/* Shortage Area Warning */}
      {shortageData && (
        <div className={s.shortageWarning}>
          <span className={s.shortageIcon}>⚠</span>
          <div>
            <strong>Health Professional Shortage Area</strong> — ZIP {zip} is HRSA-designated for{' '}
            {shortageData.shortage_areas.map(a => a.shortage_type).join(', ')}.
            Provider availability may be limited — compare a wider radius for more options.
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <Skeleton height={300} />
      ) : results && results.length > 0 ? (
        <>
          <div className={s.resultsHeader}>
            <span className={s.resultCount}>{results.length} hospitals found</span>
            <button className={s.abbyBtn} onClick={askAbby}>Ask Abby to help me choose</button>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th} style={{ textAlign: 'left' }}>Hospital</th>
                  <th className={s.th}>Location</th>
                  {hasZip && <th className={s.th}>Distance</th>}
                  <th className={s.th}>Avg Payment</th>
                  <th className={s.th}>Markup</th>
                  <th className={s.th}>CMS Stars</th>
                  <th className={s.th}>Patient Rating</th>
                  <th className={s.th}>Cases</th>
                  <th className={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {results.map(h => (
                  <tr key={h.facility_id} className={s.row} onClick={() => navigate(`/hospitals/${h.facility_id}`)}>
                    <td className={s.nameCell}>
                      <span className={s.facilityName}>{h.facility_name}</span>
                      <span className={s.hospitalType}>{h.hospital_type}</span>
                    </td>
                    <td className={s.center}>{h.city}, {h.state}</td>
                    {hasZip && <td className={s.mono}>{h.distance_miles != null ? `${h.distance_miles} mi` : '—'}</td>}
                    <td className={s.mono}>{fmtCurrency(h.avg_total_payments)}</td>
                    <td className={s.mono}>{h.markup_ratio ? `${Number(h.markup_ratio).toFixed(1)}×` : '—'}</td>
                    <td className={s.center}><span className={s.stars}>{fmtStars(h.star_rating)}</span></td>
                    <td className={s.center}><span className={s.stars}>{fmtStars(h.hcahps_overall_star)}</span></td>
                    <td className={s.mono}>{fmtNumber(h.total_discharges)}</td>
                    <td className={s.actions}>
                      <button
                        className={s.detailBtn}
                        onClick={e => { e.stopPropagation(); navigate(`/hospitals/${h.facility_id}`); }}
                      >Details</button>
                      <button
                        className={s.compareBtn}
                        onClick={e => { e.stopPropagation(); navigate(`/compare?add=${h.facility_id}`); }}
                      >Compare</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : searched && !loading ? (
        <div className={s.emptyState}>
          <p className={s.emptyTitle}>No hospitals found</p>
          <p className={s.emptyDesc}>Try expanding the search radius or changing the location filter.</p>
        </div>
      ) : !selectedDrg ? (
        <div className={s.emptyState}>
          <p className={s.emptyTitle}>Search for a procedure to get started</p>
          <p className={s.emptyDesc}>
            Type a condition or procedure name above — like "knee replacement," "heart failure," or "sepsis" — to see
            what hospitals charge, how they rate, and which ones are near you.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className={s.summaryCard}>
      <span className={s.summaryLabel}>{label}</span>
      <span className={s.summaryValue}>{value}</span>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars, fmtNumber, fmtRatio, fmtSIR } from '../utils/format.js';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip,
} from 'recharts';
import s from './HospitalCompare.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const COLORS = ['#3b82f6', '#22d3ee', '#a855f7'];

export default function HospitalCompare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState([]);  // [{facility_id, facility_name, city, state}]
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef(null);
  const initRef = useRef(false);

  // Load hospitals from URL params on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const ids = searchParams.getAll('h');
    const addId = searchParams.get('add');
    const allIds = [...new Set([...ids, ...(addId ? [addId] : [])])].slice(0, 3);

    if (allIds.length === 0) return;

    Promise.all(allIds.map(id =>
      fetch(`${API_BASE}/quality/composite/${id}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )).then(results => {
      const hospitals = results
        .filter(Boolean)
        .map(c => ({ facility_id: c.facility_id, facility_name: c.facility_name, city: c.city, state: c.state }));
      if (hospitals.length) setSelected(hospitals);
    });
  }, []);

  // Sync URL params when selection changes
  useEffect(() => {
    if (!initRef.current) return;
    const params = new URLSearchParams();
    selected.forEach(h => params.append('h', h.facility_id));
    setSearchParams(params, { replace: true });
  }, [selected, setSearchParams]);

  // Search autocomplete
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!search || search.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/quality/search?q=${encodeURIComponent(search)}&limit=10`)
        .then(r => r.json())
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function addHospital(h) {
    if (selected.length >= 3) return;
    if (selected.some(s => s.facility_id === h.facility_id)) return;
    setSelected([...selected, h]);
    setSearch('');
    setSuggestions([]);
  }

  function removeHospital(id) {
    setSelected(selected.filter(h => h.facility_id !== id));
  }

  function copyShareLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerRow}>
          <div>
            <h1 className={s.title}>Compare Hospitals</h1>
            <p className={s.subtitle}>Side-by-side comparison of up to 3 hospitals</p>
          </div>
          {selected.length > 0 && (
            <button className={s.shareBtn} onClick={copyShareLink}>
              {copied ? 'Copied!' : 'Copy Shareable Link'}
            </button>
          )}
        </div>
      </header>

      {/* Search */}
      <div className={s.searchSection}>
        <div className={s.searchWrap}>
          <input
            className={s.searchInput}
            placeholder={selected.length >= 3 ? 'Max 3 hospitals' : 'Search for a hospital to add...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={selected.length >= 3}
          />
          {suggestions.length > 0 && (
            <div className={s.dropdown}>
              {suggestions.map(h => (
                <button key={h.facility_id} className={s.dropdownItem} onClick={() => addHospital(h)}>
                  <span className={s.dropdownName}>{h.facility_name}</span>
                  <span className={s.dropdownMeta}>{h.city}, {h.state} — {fmtStars(h.star_rating)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={s.chips}>
          {selected.map((h, i) => (
            <span key={h.facility_id} className={s.chip} style={{ borderColor: COLORS[i] }}>
              <span className={s.chipDot} style={{ background: COLORS[i] }} />
              {h.facility_name}
              <button className={s.chipRemove} onClick={() => removeHospital(h.facility_id)}>×</button>
            </span>
          ))}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className={s.emptyState}>
          <p className={s.emptyTitle}>Add hospitals to compare</p>
          <p className={s.emptyDesc}>Search by name above. Compare cost, quality, safety, and patient experience side by side.</p>
        </div>
      ) : (
        <ComparisonGrid hospitals={selected} />
      )}
    </div>
  );
}

function ComparisonGrid({ hospitals }) {
  const ids = hospitals.map(h => h.facility_id);

  // Fetch data for all selected hospitals in parallel
  const { data: q0 } = useApi(ids[0] ? `/quality/composite/${ids[0]}` : null, [ids[0]]);
  const { data: q1 } = useApi(ids[1] ? `/quality/composite/${ids[1]}` : null, [ids[1]]);
  const { data: q2 } = useApi(ids[2] ? `/quality/composite/${ids[2]}` : null, [ids[2]]);

  const { data: h0 } = useApi(ids[0] ? `/quality/hcahps/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: h1 } = useApi(ids[1] ? `/quality/hcahps/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: h2 } = useApi(ids[2] ? `/quality/hcahps/hospital/${ids[2]}` : null, [ids[2]]);

  const { data: v0 } = useApi(ids[0] ? `/vbp/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: v1 } = useApi(ids[1] ? `/vbp/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: v2 } = useApi(ids[2] ? `/vbp/hospital/${ids[2]}` : null, [ids[2]]);

  const composites = [q0, q1, q2].slice(0, hospitals.length);
  const hcahps = [h0, h1, h2].slice(0, hospitals.length);
  const vbps = [v0, v1, v2].slice(0, hospitals.length);
  const count = hospitals.length;

  const loading = composites.some((c, i) => i < count && !c);
  if (loading) return <Skeleton height={400} />;

  const cols = composites.map((c, i) => ({
    name: hospitals[i].facility_name,
    composite: c || {},
    hcahps: hcahps[i] || {},
    vbp: vbps[i] || {},
  }));

  function bestIdx(values, lower) {
    const nums = values.map(v => v != null ? Number(v) : null);
    const valid = nums.filter(n => n != null);
    if (!valid.length) return -1;
    const best = lower ? Math.min(...valid) : Math.max(...valid);
    return nums.indexOf(best);
  }

  function Row({ label, values, fmt = v => v, lowerIsBetter = false }) {
    const best = bestIdx(values, lowerIsBetter);
    return (
      <tr>
        <td className={s.rowLabel}>{label}</td>
        {values.map((v, i) => (
          <td key={i} className={`${s.rowValue} ${i === best && count > 1 ? s.best : ''} ${i !== best && best >= 0 && count > 1 ? s.notBest : ''}`}>
            {v != null ? fmt(v) : '—'}
          </td>
        ))}
      </tr>
    );
  }

  // Radar chart data — normalize to 0-100
  const radarData = count >= 2 ? buildRadarData(cols) : null;

  return (
    <>
      <div className={s.compareWrap}>
        <table className={s.compareTable}>
          <thead>
            <tr>
              <th className={s.cornerCell}></th>
              {cols.map((c, i) => (
                <th key={i} className={s.hospitalHeader}>
                  <span className={s.hospitalHeaderName}>{c.name}</span>
                  <span className={s.hospitalHeaderMeta}>{c.composite.city}, {c.composite.state}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Quality */}
            <tr className={s.sectionRow}><td colSpan={count + 1}>Quality & Ratings</td></tr>
            <Row label="CMS Star Rating" values={cols.map(c => c.composite.star_rating)} fmt={v => fmtStars(v)} />
            <Row label="Patient Rating (HCAHPS)" values={cols.map(c => c.hcahps.overall_star)} fmt={v => fmtStars(v)} />
            <Row label="Would Recommend" values={cols.map(c => c.hcahps.recommend_star)} fmt={v => fmtStars(v)} />

            {/* Cost */}
            <tr className={s.sectionRow}><td colSpan={count + 1}>Cost</td></tr>
            <Row label="Avg Payment" values={cols.map(c => c.composite.weighted_avg_payment)} fmt={fmtCurrency} />
            <Row label="Total Discharges" values={cols.map(c => c.composite.total_discharges)} fmt={fmtNumber} />

            {/* Safety */}
            <tr className={s.sectionRow}><td colSpan={count + 1}>Safety</td></tr>
            <Row label="PSI-90" values={cols.map(c => c.composite.psi_90_score)} fmt={v => Number(v).toFixed(3)} lowerIsBetter />
            <Row label="HAC Penalty" values={cols.map(c => c.composite.hac_payment_reduction)} fmt={v => v} />
            <Row label="Readm Ratio" values={cols.map(c => c.composite.avg_excess_readm_ratio)} fmt={v => fmtRatio(v)} lowerIsBetter />
            <Row label="Mortality Rate" values={cols.map(c => c.composite.avg_mortality_rate)} fmt={v => `${Number(v).toFixed(1)}%`} lowerIsBetter />

            {/* VBP */}
            <tr className={s.sectionRow}><td colSpan={count + 1}>Value-Based Purchasing</td></tr>
            <Row label="Total Performance" values={cols.map(c => c.vbp.total_performance_score)} fmt={v => Number(v).toFixed(1)} />
            <Row label="Clinical Outcomes" values={cols.map(c => c.vbp.clinical_outcomes_score_w)} fmt={v => Number(v).toFixed(1)} />
            <Row label="Safety Score" values={cols.map(c => c.vbp.safety_score_w)} fmt={v => Number(v).toFixed(1)} />
            <Row label="Efficiency" values={cols.map(c => c.vbp.efficiency_score_w)} fmt={v => Number(v).toFixed(1)} />
            <Row label="Engagement" values={cols.map(c => c.vbp.person_engagement_score_w)} fmt={v => Number(v).toFixed(1)} />
          </tbody>
        </table>
      </div>

      {/* Radar Chart */}
      {radarData && (
        <Panel title="Performance Radar">
          <div className={s.radarWrap}>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="var(--border-dim)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'Inter' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {cols.map((c, i) => (
                  <Radar
                    key={i}
                    name={c.name}
                    dataKey={`h${i}`}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                ))}
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#71717a' }}
                />
                <Tooltip
                  contentStyle={{ background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 }}
                  formatter={v => `${v}/100`}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
    </>
  );
}

function buildRadarData(cols) {
  // Normalize each dimension to 0-100
  function norm(val, max) {
    if (val == null) return 0;
    return Math.round(Math.min(100, Math.max(0, (Number(val) / max) * 100)));
  }

  function invNorm(val, max) {
    // Lower is better — invert
    if (val == null) return 0;
    const v = Number(val);
    return Math.round(Math.min(100, Math.max(0, (1 - v / max) * 100)));
  }

  const dimensions = [
    { dimension: 'CMS Stars', key: c => c.composite.star_rating, max: 5 },
    { dimension: 'Patient Experience', key: c => c.hcahps.overall_star, max: 5 },
    { dimension: 'VBP Performance', key: c => c.vbp.total_performance_score, max: 100 },
    { dimension: 'Safety', key: c => c.composite.psi_90_score, max: 2, invert: true },
    { dimension: 'Efficiency', key: c => c.vbp.efficiency_score_w, max: 25 },
  ];

  return dimensions.map(d => {
    const row = { dimension: d.dimension };
    cols.forEach((c, i) => {
      const val = d.key(c);
      row[`h${i}`] = d.invert ? invNorm(val, d.max) : norm(val, d.max);
    });
    return row;
  });
}

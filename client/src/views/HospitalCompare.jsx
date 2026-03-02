import { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars, fmtNumber, fmtRatio, fmtSIR } from '../utils/format.js';
import s from './HospitalCompare.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function HospitalCompare() {
  const [selected, setSelected] = useState([]);  // [{facility_id, facility_name, city, state}]
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);

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

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Compare Hospitals</h1>
        <p className={s.subtitle}>Side-by-side comparison of up to 3 hospitals</p>
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
          {selected.map(h => (
            <span key={h.facility_id} className={s.chip}>
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

  return (
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
  );
}

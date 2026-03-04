import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtStars, fmtNumber, fmtRatio } from '../utils/format.js';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip,
} from 'recharts';
import s from './HospitalCompare.module.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
function authHeaders() {
  const t = localStorage.getItem('authToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const COLORS = ['#3b82f6', '#22d3ee', '#a855f7'];
const COLOR_NAMES = ['Blue', 'Cyan', 'Purple'];

const SUGGESTED = [
  {
    label: '5-Star Award Winners',
    desc: 'Three hospitals with top CMS ratings',
    ids: ['030103', '240057', '360180'], // Mayo Phoenix, Abbott Northwestern, Cleveland Clinic
    names: ['Mayo Clinic Hospital, AZ', 'Abbott Northwestern, MN', 'Cleveland Clinic, OH'],
  },
  {
    label: 'Pittsburgh Health Systems',
    desc: 'Compare Western PA\'s major networks',
    ids: ['390086', '390050', '390223'],
    names: ['UPMC Shadyside', 'Allegheny General', 'St. Clair Hospital'],
  },
  {
    label: 'Academic Medical Centers',
    desc: 'Major teaching hospitals compared',
    ids: ['210009', '330214', '140010'],
    names: ['Johns Hopkins', 'NYU Langone', 'Northwestern Memorial'],
  },
];

/* ── helpers ──────────────────────────────────────────────────────── */
function starLabel(n) {
  if (!n) return '—';
  return '★'.repeat(Number(n)) + '☆'.repeat(5 - Number(n));
}

function extractHAI(rows = []) {
  const find = (id) => {
    const r = rows.find(r => r.measure_id === id);
    return r?.score != null ? Number(r.score) : null;
  };
  return {
    clabsi: find('HAI_1_SIR'),
    cauti:  find('HAI_2_SIR'),
    ssi:    find('HAI_3_SIR'),
    mrsa:   find('HAI_6_SIR'),
    cdi:    find('HAI_5_SIR'),
  };
}

function extractReadm(rows = []) {
  const find = (fragment) => {
    const r = rows.find(r => r.measure_name?.includes(fragment));
    return r?.excess_readmission_ratio != null ? Number(r.excess_readmission_ratio) : null;
  };
  return {
    ami: find('Acute Myocardial Infarction'),
    hf:  find('Heart Failure'),
    pn:  find('Pneumonia'),
    hip: find('Hip/Knee'),
    cabg: find('CABG'),
  };
}

function extractTimely(rows = []) {
  const find = (id) => {
    const r = rows.find(r => r.measure_id === id);
    if (!r?.score) return null;
    const n = Number(r.score);
    return isNaN(n) ? null : n;
  };
  return {
    ed1b: find('ED_1b'),   // median time to admit (mins) — lower better
    ed2b: find('ED_2b'),   // median time ED to departure for admitted (mins)
    op18b: find('OP_18b'), // median time in ED (mins)
    sepsis: find('SEP_1'), // sepsis bundle compliance (%) — higher better
  };
}

/* ══════════════════════════════════════════════════════════════════ */
export default function HospitalCompare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState([]);
  const [activeSlot, setActiveSlot] = useState(null);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [copied, setCopied] = useState(false);
  const [drgCode, setDrgCode] = useState('');
  const debounceRef = useRef(null);
  const initRef = useRef(false);
  const searchInputRef = useRef(null);

  const { data: drgList } = useApi('/drgs/top50', []);

  // Load hospitals from URL on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const ids = searchParams.getAll('h');
    const addId = searchParams.get('add');
    const allIds = [...new Set([...ids, ...(addId ? [addId] : [])])].slice(0, 3);
    if (!allIds.length) return;
    Promise.all(allIds.map(id =>
      fetch(`${API_BASE}/quality/composite/${id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const hospitals = results.filter(Boolean).map(c => ({
        facility_id: c.facility_id, facility_name: c.facility_name,
        city: c.city, state: c.state, star_rating: c.star_rating,
        hospital_type: c.hospital_type,
      }));
      if (hospitals.length) setSelected(hospitals);
    });
  }, []);

  // Sync URL when selection changes
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
      fetch(`${API_BASE}/quality/search?q=${encodeURIComponent(search)}&limit=10`, { headers: authHeaders() })
        .then(r => r.json()).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function addHospital(h) {
    const slot = activeSlot ?? selected.length;
    if (slot >= 3) return;
    if (selected.some(s => s.facility_id === h.facility_id)) return;
    const next = [...selected];
    next[slot] = { facility_id: h.facility_id, facility_name: h.facility_name, city: h.city, state: h.state, star_rating: h.star_rating };
    setSelected(next.filter(Boolean));
    setSearch('');
    setSuggestions([]);
    setActiveSlot(null);
  }

  function removeHospital(idx) {
    setSelected(selected.filter((_, i) => i !== idx));
  }

  function loadSuggested(set) {
    Promise.all(set.ids.map(id =>
      fetch(`${API_BASE}/quality/composite/${id}`, { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null)
    )).then(results => {
      const hospitals = results.filter(Boolean).map(c => ({
        facility_id: c.facility_id, facility_name: c.facility_name,
        city: c.city, state: c.state, star_rating: c.star_rating,
      }));
      setSelected(hospitals);
    });
  }

  function copyShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function focusSlot(idx) {
    setActiveSlot(idx);
    setSearch('');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerRow}>
          <div>
            <h1 className={s.title}>Compare Hospitals</h1>
            <p className={s.subtitle}>Side-by-side comparison across quality, safety, cost, and financials</p>
          </div>
          {selected.length > 0 && (
            <div className={s.headerActions}>
              <button className={s.shareBtn} onClick={copyShareLink}>
                {copied ? '✓ Copied' : 'Share Link'}
              </button>
              <button className={s.clearBtn} onClick={() => setSelected([])}>Clear All</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Slot Picker ── */}
      <div className={s.slotRow}>
        {[0, 1, 2].map(idx => {
          const h = selected[idx];
          const color = COLORS[idx];
          const isActive = activeSlot === idx;
          return (
            <div
              key={idx}
              className={`${s.slot} ${h ? s.slotFilled : s.slotEmpty} ${isActive ? s.slotActive : ''}`}
              style={{ '--slot-color': color }}
            >
              {h ? (
                <>
                  <div className={s.slotDot} style={{ background: color }} />
                  <div className={s.slotInfo}>
                    <span className={s.slotName}>{h.facility_name}</span>
                    <span className={s.slotMeta}>{h.city}, {h.state}</span>
                    {h.star_rating && <span className={s.slotStars} style={{ color }}>{starLabel(h.star_rating)}</span>}
                  </div>
                  <button className={s.slotRemove} onClick={() => removeHospital(idx)} title="Remove">×</button>
                </>
              ) : (
                <button className={s.slotAdd} onClick={() => focusSlot(idx)}>
                  <span className={s.slotAddIcon} style={{ color }}>+</span>
                  <span className={s.slotAddLabel}>
                    {isActive ? 'Type to search…' : `Add Hospital ${idx + 1}`}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Search input (shown when a slot is active or < 3 filled) ── */}
      {(activeSlot !== null || selected.length < 3) && (
        <div className={s.searchWrap}>
          <input
            ref={searchInputRef}
            className={s.searchInput}
            placeholder={activeSlot !== null ? `Searching for slot ${activeSlot + 1}…` : 'Search for a hospital to add…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => { if (activeSlot === null && selected.length < 3) setActiveSlot(selected.length); }}
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
      )}

      {/* ── Empty state with suggestions ── */}
      {selected.length === 0 && (
        <div className={s.emptyState}>
          <p className={s.emptyTitle}>Add hospitals above to compare</p>
          <p className={s.emptyDesc}>Or start with a suggested comparison:</p>
          <div className={s.suggestedSets}>
            {SUGGESTED.map((set, i) => (
              <button key={i} className={s.suggestedCard} onClick={() => loadSuggested(set)}>
                <span className={s.suggestedLabel}>{set.label}</span>
                <span className={s.suggestedDesc}>{set.desc}</span>
                <div className={s.suggestedNames}>
                  {set.names.map((n, j) => (
                    <span key={j} className={s.suggestedName} style={{ color: COLORS[j] }}>• {n}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DRG selector (when hospitals selected) ── */}
      {selected.length > 0 && drgList?.length > 0 && (
        <div className={s.drgBar}>
          <label className={s.drgLabel}>Procedure cost comparison:</label>
          <select
            className={s.drgSelect}
            value={drgCode}
            onChange={e => setDrgCode(e.target.value)}
          >
            <option value="">— Select a procedure (optional) —</option>
            {drgList.map(d => (
              <option key={d.drg_cd} value={d.drg_cd}>
                {d.drg_cd} — {d.drg_desc?.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Comparison Grid ── */}
      {selected.length > 0 && (
        <ComparisonGrid hospitals={selected} drgCode={drgCode} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
function ComparisonGrid({ hospitals, drgCode }) {
  const [openSections, setOpenSections] = useState(
    () => new Set(['Quality & Ratings', 'Cost', 'Safety', 'Infections (HAI)', 'Readmissions', 'Timely Care', 'Financials', 'Value-Based Purchasing'])
  );

  const ids = hospitals.map(h => h.facility_id);
  const count = hospitals.length;

  // Existing data
  const { data: q0 } = useApi(ids[0] ? `/quality/composite/${ids[0]}` : null, [ids[0]]);
  const { data: q1 } = useApi(ids[1] ? `/quality/composite/${ids[1]}` : null, [ids[1]]);
  const { data: q2 } = useApi(ids[2] ? `/quality/composite/${ids[2]}` : null, [ids[2]]);

  const { data: h0 } = useApi(ids[0] ? `/quality/hcahps/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: h1 } = useApi(ids[1] ? `/quality/hcahps/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: h2 } = useApi(ids[2] ? `/quality/hcahps/hospital/${ids[2]}` : null, [ids[2]]);

  const { data: v0 } = useApi(ids[0] ? `/vbp/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: v1 } = useApi(ids[1] ? `/vbp/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: v2 } = useApi(ids[2] ? `/vbp/hospital/${ids[2]}` : null, [ids[2]]);

  // New data
  const { data: hai0 } = useApi(ids[0] ? `/quality/hai/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: hai1 } = useApi(ids[1] ? `/quality/hai/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: hai2 } = useApi(ids[2] ? `/quality/hai/hospital/${ids[2]}` : null, [ids[2]]);

  const { data: rm0 } = useApi(ids[0] ? `/quality/readmissions/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: rm1 } = useApi(ids[1] ? `/quality/readmissions/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: rm2 } = useApi(ids[2] ? `/quality/readmissions/hospital/${ids[2]}` : null, [ids[2]]);

  const { data: tc0 } = useApi(ids[0] ? `/quality/timely-care/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: tc1 } = useApi(ids[1] ? `/quality/timely-care/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: tc2 } = useApi(ids[2] ? `/quality/timely-care/hospital/${ids[2]}` : null, [ids[2]]);

  const { data: fin0 } = useApi(ids[0] ? `/financials/hospital/${ids[0]}` : null, [ids[0]]);
  const { data: fin1 } = useApi(ids[1] ? `/financials/hospital/${ids[1]}` : null, [ids[1]]);
  const { data: fin2 } = useApi(ids[2] ? `/financials/hospital/${ids[2]}` : null, [ids[2]]);

  // DRG-specific cost
  const ccnsParam = ids.slice(0, count).join(',');
  const { data: drgCosts } = useApi(
    drgCode ? `/drgs/${drgCode}/hospitals?ccns=${ccnsParam}` : null,
    [drgCode, ccnsParam]
  );

  const composites = [q0, q1, q2].slice(0, count);
  const loading = composites.some((c, i) => i < count && !c);
  if (loading) return <Skeleton height={500} />;

  const cols = composites.map((c, i) => ({
    name: hospitals[i].facility_name,
    composite: c || {},
    hcahps:    [h0, h1, h2][i] || {},
    vbp:       [v0, v1, v2][i] || {},
    hai:       extractHAI([hai0, hai1, hai2][i] || []),
    readm:     extractReadm([rm0, rm1, rm2][i] || []),
    timely:    extractTimely([tc0, tc1, tc2][i] || []),
    fin:       ([fin0, fin1, fin2][i]?.financials || [])[0] || {},
    drgCost:   drgCosts?.find(d => d.provider_ccn === hospitals[i].facility_id) || null,
  }));

  // ── Win tracking ─────────────────────────────────────────────────
  function bestIdx(values, lower = false) {
    const nums = values.map(v => v != null ? Number(v) : null);
    const valid = nums.filter(n => n != null);
    if (!valid.length) return -1;
    const best = lower ? Math.min(...valid) : Math.max(...valid);
    return nums.indexOf(best);
  }

  // Count wins per hospital per category
  const categoryWins = { 'Quality': Array(count).fill(0), 'Cost': Array(count).fill(0), 'Safety': Array(count).fill(0), 'Financials': Array(count).fill(0) };
  function countWin(cat, values, lower = false) {
    const bi = bestIdx(values, lower);
    if (bi >= 0 && categoryWins[cat]) categoryWins[cat][bi]++;
  }

  countWin('Quality', cols.map(c => c.composite.star_rating));
  countWin('Quality', cols.map(c => c.hcahps.overall_star));
  countWin('Cost',    cols.map(c => c.composite.weighted_avg_payment), true);
  countWin('Safety',  cols.map(c => c.composite.psi_90_score), true);
  countWin('Safety',  cols.map(c => c.composite.avg_excess_readm_ratio), true);
  countWin('Financials', cols.map(c => c.fin.occupancy_pct));

  // ── Toggle sections ───────────────────────────────────────────────
  function toggleSection(name) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  // ── Row component ─────────────────────────────────────────────────
  function Row({ label, values, fmt = v => v, lower = false, indent = false }) {
    const bi = bestIdx(values, lower);
    return (
      <tr>
        <td className={`${s.rowLabel} ${indent ? s.rowLabelIndent : ''}`}>{label}</td>
        {values.map((v, i) => (
          <td key={i} className={`${s.rowValue} ${i === bi && count > 1 ? s.best : ''} ${i !== bi && bi >= 0 && count > 1 ? s.notBest : ''}`}>
            {v != null ? fmt(v) : '—'}
          </td>
        ))}
      </tr>
    );
  }

  function SectionHeader({ name }) {
    const isOpen = openSections.has(name);
    return (
      <tr className={s.sectionRow} onClick={() => toggleSection(name)}>
        <td colSpan={count + 1}>
          <span>{name}</span>
          <span className={`${s.sectionChevron} ${isOpen ? s.sectionChevronOpen : ''}`}>›</span>
        </td>
      </tr>
    );
  }

  function SectionRows({ name, children }) {
    return openSections.has(name) ? children : null;
  }

  const radarData = count >= 2 ? buildRadarData(cols) : null;

  return (
    <>
      {/* ── Winner summary bar ── */}
      {count > 1 && (
        <div className={s.winnerBar}>
          <div className={s.winnerBarLabel}>Category leaders</div>
          <div className={s.winnerCols}>
            {cols.map((c, i) => {
              const cats = Object.entries(categoryWins).filter(([, wins]) => wins[i] === Math.max(...wins)).map(([cat]) => cat);
              return (
                <div key={i} className={s.winnerCol} style={{ '--slot-color': COLORS[i] }}>
                  <div className={s.winnerDot} style={{ background: COLORS[i] }} />
                  <div className={s.winnerName}>{c.composite.facility_name || c.name}</div>
                  <div className={s.winnerCats}>
                    {cats.length ? cats.map(cat => (
                      <span key={cat} className={s.winnerBadge}>{cat}</span>
                    )) : <span className={s.winnerBadgeNone}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Comparison table ── */}
      <div className={s.compareWrap}>
        <table className={s.compareTable}>
          <thead>
            <tr>
              <th className={s.cornerCell} />
              {cols.map((c, i) => (
                <th key={i} className={s.hospitalHeader} style={{ borderTopColor: COLORS[i] }}>
                  <div className={s.hospitalHeaderDot} style={{ background: COLORS[i] }} />
                  <span className={s.hospitalHeaderName}>{c.name}</span>
                  <span className={s.hospitalHeaderMeta}>{c.composite.city}, {c.composite.state}</span>
                  {c.composite.star_rating && (
                    <span className={s.hospitalHeaderStars} style={{ color: COLORS[i] }}>
                      {starLabel(c.composite.star_rating)} CMS
                    </span>
                  )}
                  {c.composite.hospital_type && (
                    <span className={s.hospitalHeaderType}>{c.composite.hospital_type}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Quality */}
            <SectionHeader name="Quality & Ratings" />
            <SectionRows name="Quality & Ratings">
              <Row label="CMS Star Rating"       values={cols.map(c => c.composite.star_rating)}   fmt={v => fmtStars(v)} />
              <Row label="Patient Rating (HCAHPS)" values={cols.map(c => c.hcahps.overall_star)}  fmt={v => fmtStars(v)} />
              <Row label="Would Recommend"       values={cols.map(c => c.hcahps.recommend_star)}   fmt={v => fmtStars(v)} />
              <Row label="Nurse Communication"   values={cols.map(c => c.hcahps.nurse_comm_star)}  fmt={v => fmtStars(v)} />
              <Row label="Doctor Communication"  values={cols.map(c => c.hcahps.doc_comm_star)}    fmt={v => fmtStars(v)} />
            </SectionRows>

            {/* Cost */}
            <SectionHeader name="Cost" />
            <SectionRows name="Cost">
              <Row label="Avg Medicare Payment"  values={cols.map(c => c.composite.weighted_avg_payment)} fmt={fmtCurrency} lower />
              <Row label="Avg Covered Charges"   values={cols.map(c => c.composite.weighted_avg_charges)} fmt={fmtCurrency} lower />
              <Row label="Total Discharges"      values={cols.map(c => c.composite.total_discharges)}     fmt={fmtNumber} />
              {drgCode && (
                <>
                  <tr className={s.subSectionRow}><td colSpan={count + 1}>Procedure Cost (selected DRG)</td></tr>
                  <Row label="Avg Payment (DRG)"  values={cols.map(c => c.drgCost?.avg_payment)}   fmt={fmtCurrency} lower indent />
                  <Row label="Avg Charges (DRG)"  values={cols.map(c => c.drgCost?.avg_charges)}   fmt={fmtCurrency} lower indent />
                  <Row label="Discharges (DRG)"   values={cols.map(c => c.drgCost?.total_discharges)} fmt={fmtNumber} indent />
                </>
              )}
            </SectionRows>

            {/* Safety */}
            <SectionHeader name="Safety" />
            <SectionRows name="Safety">
              <Row label="PSI-90 Score"          values={cols.map(c => c.composite.psi_90_score)}           fmt={v => Number(v).toFixed(3)} lower />
              <Row label="HAC Penalty"           values={cols.map(c => c.composite.hac_payment_reduction)}   fmt={v => v} />
              <Row label="Readm. Ratio (avg)"    values={cols.map(c => c.composite.avg_excess_readm_ratio)}  fmt={fmtRatio} lower />
              <Row label="Mortality Rate (avg)"  values={cols.map(c => c.composite.avg_mortality_rate)}      fmt={v => `${Number(v).toFixed(1)}%`} lower />
            </SectionRows>

            {/* HAI */}
            <SectionHeader name="Infections (HAI)" />
            <SectionRows name="Infections (HAI)">
              <tr className={s.subSectionRow}><td colSpan={count + 1}>Standardised Infection Ratios — lower is better (national avg = 1.0)</td></tr>
              <Row label="CLABSI (blood stream)" values={cols.map(c => c.hai.clabsi)} fmt={v => Number(v).toFixed(3)} lower indent />
              <Row label="CAUTI (urinary tract)" values={cols.map(c => c.hai.cauti)}  fmt={v => Number(v).toFixed(3)} lower indent />
              <Row label="SSI (surgical site)"   values={cols.map(c => c.hai.ssi)}    fmt={v => Number(v).toFixed(3)} lower indent />
              <Row label="MRSA bacteremia"       values={cols.map(c => c.hai.mrsa)}   fmt={v => Number(v).toFixed(3)} lower indent />
              <Row label="C. difficile"          values={cols.map(c => c.hai.cdi)}    fmt={v => Number(v).toFixed(3)} lower indent />
            </SectionRows>

            {/* Readmissions */}
            <SectionHeader name="Readmissions" />
            <SectionRows name="Readmissions">
              <tr className={s.subSectionRow}><td colSpan={count + 1}>Excess Readmission Ratio — lower is better ({'<'}1.0 = better than expected)</td></tr>
              <Row label="Heart Attack (AMI)" values={cols.map(c => c.readm.ami)}  fmt={v => Number(v).toFixed(4)} lower indent />
              <Row label="Heart Failure"      values={cols.map(c => c.readm.hf)}   fmt={v => Number(v).toFixed(4)} lower indent />
              <Row label="Pneumonia"          values={cols.map(c => c.readm.pn)}   fmt={v => Number(v).toFixed(4)} lower indent />
              <Row label="Hip/Knee Replace."  values={cols.map(c => c.readm.hip)}  fmt={v => Number(v).toFixed(4)} lower indent />
              <Row label="CABG Surgery"       values={cols.map(c => c.readm.cabg)} fmt={v => Number(v).toFixed(4)} lower indent />
            </SectionRows>

            {/* Timely Care */}
            <SectionHeader name="Timely Care" />
            <SectionRows name="Timely Care">
              <Row label="Median ED Wait (mins)"     values={cols.map(c => c.timely.op18b)} fmt={v => `${fmtNumber(v)} min`} lower />
              <Row label="ED to Admission (mins)"    values={cols.map(c => c.timely.ed1b)}  fmt={v => `${fmtNumber(v)} min`} lower />
              <Row label="ED Departure Time (mins)"  values={cols.map(c => c.timely.ed2b)}  fmt={v => `${fmtNumber(v)} min`} lower />
              <Row label="Sepsis Bundle Compliance"  values={cols.map(c => c.timely.sepsis)} fmt={v => `${v}%`} />
            </SectionRows>

            {/* Financials */}
            <SectionHeader name="Financials" />
            <SectionRows name="Financials">
              <Row label="Total Patient Charges"    values={cols.map(c => c.fin.total_patient_charges)}    fmt={v => fmtCurrency(v, 0)} lower />
              <Row label="Licensed Beds"            values={cols.map(c => c.fin.licensed_beds)}             fmt={fmtNumber} />
              <Row label="Bed Occupancy"            values={cols.map(c => c.fin.occupancy_pct)}             fmt={v => `${v}%`} />
              <Row label="Uncompensated Care Cost"  values={cols.map(c => c.fin.uncompensated_care_cost)}   fmt={v => fmtCurrency(v, 0)} lower />
              <Row label="Uncomp. Care % Charges"   values={cols.map(c => c.fin.uncomp_pct_charges)}        fmt={v => `${v}%`} />
            </SectionRows>

            {/* VBP */}
            <SectionHeader name="Value-Based Purchasing" />
            <SectionRows name="Value-Based Purchasing">
              <Row label="Total Performance"   values={cols.map(c => c.vbp.total_performance_score)}       fmt={v => Number(v).toFixed(1)} />
              <Row label="Clinical Outcomes"   values={cols.map(c => c.vbp.clinical_outcomes_score_w)}     fmt={v => Number(v).toFixed(1)} />
              <Row label="Safety Score"        values={cols.map(c => c.vbp.safety_score_w)}                fmt={v => Number(v).toFixed(1)} />
              <Row label="Efficiency"          values={cols.map(c => c.vbp.efficiency_score_w)}            fmt={v => Number(v).toFixed(1)} />
              <Row label="Patient Engagement"  values={cols.map(c => c.vbp.person_engagement_score_w)}     fmt={v => Number(v).toFixed(1)} />
            </SectionRows>
          </tbody>
        </table>
      </div>

      {/* ── Radar Chart ── */}
      {radarData && (
        <Panel title="Performance Radar — 8 Dimensions">
          <div className={s.radarWrap}>
            <ResponsiveContainer width="100%" height={380}>
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="var(--border-dim)" />
                <PolarAngleAxis dataKey="dimension" tick={{ fill: '#71717a', fontSize: 11, fontFamily: 'Inter' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {cols.map((c, i) => (
                  <Radar key={i} name={c.name} dataKey={`h${i}`}
                    stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.12} strokeWidth={2} />
                ))}
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter', color: '#71717a' }} />
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

/* ── Radar builder — 8 dimensions ─────────────────────────────────── */
function buildRadarData(cols) {
  function norm(val, max)    { if (val == null) return 0; return Math.round(Math.min(100, Math.max(0, (Number(val) / max) * 100))); }
  function invNorm(val, max) { if (val == null) return 0; const v = Number(val); return Math.round(Math.min(100, Math.max(0, (1 - v / max) * 100))); }

  // HAI composite: average of available SIRs, inverted
  function haiScore(c) {
    const sirs = [c.hai.clabsi, c.hai.cauti, c.hai.ssi, c.hai.mrsa, c.hai.cdi].filter(v => v != null);
    if (!sirs.length) return null;
    return sirs.reduce((a, b) => a + b, 0) / sirs.length;
  }

  // Readmission composite: average of available ratios, inverted
  function readmScore(c) {
    const ratios = [c.readm.ami, c.readm.hf, c.readm.pn].filter(v => v != null);
    if (!ratios.length) return null;
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }

  const dimensions = [
    { dimension: 'CMS Stars',          key: c => c.composite.star_rating,           max: 5 },
    { dimension: 'Patient Experience', key: c => c.hcahps.overall_star,             max: 5 },
    { dimension: 'VBP Performance',    key: c => c.vbp.total_performance_score,     max: 100 },
    { dimension: 'Safety (PSI-90)',    key: c => c.composite.psi_90_score,          max: 2,   invert: true },
    { dimension: 'Efficiency',         key: c => c.vbp.efficiency_score_w,          max: 25 },
    { dimension: 'Infection Control',  key: haiScore,                               max: 2,   invert: true },
    { dimension: 'Readmissions',       key: readmScore,                             max: 1.3, invert: true },
    { dimension: 'Cost Efficiency',    key: c => c.composite.weighted_avg_payment,  max: 40000, invert: true },
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

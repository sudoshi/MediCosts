import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './ExcellenceView.module.css';

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

/* Percentile rank helper — higher = better rank */
function rankPct(val, arr) {
  if (val == null || arr.length === 0) return 0;
  const below = arr.filter(v => v < val).length;
  return (below / arr.length) * 100;
}

/* Composite excellence score (0–100) */
function computeExcellenceScores(facilities) {
  if (!facilities?.length) return [];

  const stVals   = facilities.map(f => Number(f.star_rating) || 0).filter(Boolean);
  const psiVals  = facilities.map(f => Number(f.psi_90_score) || 0).filter(Boolean);
  const readmVals= facilities.map(f => Number(f.avg_excess_readm_ratio) || 0).filter(Boolean);
  const mortVals = facilities.map(f => Number(f.avg_mortality_rate) || 0).filter(Boolean);

  return facilities
    .map(f => {
      const star_pct  = rankPct(Number(f.star_rating), stVals);              // high = good
      const safety_pct = 100 - rankPct(Number(f.psi_90_score), psiVals);     // low = good, invert
      const readm_pct  = 100 - rankPct(Number(f.avg_excess_readm_ratio), readmVals); // low = good
      const mort_pct   = 100 - rankPct(Number(f.avg_mortality_rate), mortVals);      // low = good

      const excellence = (
        star_pct  * 0.30 +
        safety_pct * 0.30 +
        readm_pct  * 0.25 +
        mort_pct   * 0.15
      );

      return { ...f, excellence };
    })
    .filter(f => f.excellence >= 50 && f.star_rating >= 3)
    .sort((a, b) => b.excellence - a.excellence)
    .slice(0, 25);
}

function excellenceBadge(score) {
  if (score >= 80) return s.badgeGold;
  if (score >= 65) return s.badgeEmerald;
  if (score >= 50) return s.badgeBlue;
  return s.badgeZinc;
}

function starColor(stars) {
  if (stars >= 5) return '#f59e0b';
  if (stars >= 4) return '#10b981';
  if (stars >= 3) return '#60a5fa';
  return 'var(--text-tertiary)';
}

function rowGreen(score, maxScore) {
  if (!maxScore) return {};
  const ratio = score / maxScore;
  if (ratio < 0.6) return {};
  const alpha = (ratio - 0.6) / 0.4 * 0.12;
  return { background: `rgba(16, 185, 129, ${alpha})` };
}

function fmtPsi(v) {
  if (v == null) return '—';
  return Number(v).toFixed(2);
}

function fmtRatio(v) {
  if (v == null) return '—';
  return Number(v).toFixed(3);
}

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function ExcellenceView() {
  const navigate = useNavigate();
  const [state, setState] = useState('');
  const qs = state ? `state=${state}&` : '';

  /* Composite data — sorted best-first */
  const { data: starData,  loading: loadStar } = useApi(
    `/quality/composite?${qs}sort=star_rating&order=desc&limit=100`, [state]
  );
  const { data: safeData,  loading: loadSafe } = useApi(
    `/quality/composite?${qs}sort=psi_90_score&order=asc&limit=100`, [state]
  );
  const { data: summary,   loading: loadSum  } = useApi('/quality/accountability/summary');
  const { data: hacRaw,    loading: loadHac  } = useApi('/quality/psi/summary');

  const coreLoading = loadStar || loadSafe;

  /* Spotlight picks */
  const bestStar  = starData?.[0] || null;
  const safest    = useMemo(() => {
    if (!safeData) return null;
    return safeData.find(r => Number(r.star_rating) >= 3 && Number(r.psi_90_score) > 0) || safeData[0];
  }, [safeData]);
  const bestReadm = useMemo(() => {
    if (!starData) return null;
    return [...starData]
      .filter(r => Number(r.avg_excess_readm_ratio) > 0 && Number(r.avg_excess_readm_ratio) < 1.0)
      .sort((a, b) => Number(a.avg_excess_readm_ratio) - Number(b.avg_excess_readm_ratio))[0] || null;
  }, [starData]);

  /* Honor Roll */
  const combined = useMemo(() => {
    if (!starData || !safeData) return [];
    const seen = new Set();
    const merged = [];
    for (const r of [...starData, ...safeData]) {
      if (!seen.has(r.facility_id)) { seen.add(r.facility_id); merged.push(r); }
    }
    return merged;
  }, [starData, safeData]);

  const honorRoll = useMemo(() => computeExcellenceScores(combined), [combined]);
  const maxExcellence = honorRoll[0]?.excellence || 0;

  /* KPI context */
  const avgNationalStar = summary?.avg_patient_star || null;
  const hacClearedCount = useMemo(() => {
    if (!hacRaw) return null;
    const total = Number(hacRaw.total_hospitals) || 0;
    const penalized = Number(hacRaw.penalized) || 0;
    return total - penalized;
  }, [hacRaw]);

  const medianPsi = useMemo(() => {
    if (!safeData?.length) return null;
    const vals = safeData
      .map(r => Number(r.psi_90_score))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  }, [safeData]);

  const pctAboveAvgStar = useMemo(() => {
    if (!starData?.length || !avgNationalStar) return null;
    const count = starData.filter(r => Number(r.star_rating) >= 4).length;
    return Math.round((count / starData.length) * 100);
  }, [starData, avgNationalStar]);

  return (
    <div className={s.page}>

      {/* ── Header row ── */}
      <div className={s.headerRow}>
        <div>
          <h1 className={s.title}>Best of the Best</h1>
          <p className={s.subtitle}>Excellence in quality, safety, and patient outcomes — the facilities that get it right</p>
        </div>
        <div className={s.stateFilter}>
          <span className={s.fieldLabel}>Filter by State</span>
          <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      {/* ── Hero Stats ── */}
      <div className={s.heroRow}>
        {loadSum || loadHac ? <Skeleton height={80} /> : (
          <>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#f59e0b' }}>
                {hacClearedCount != null ? hacClearedCount.toLocaleString() : '—'}
              </span>
              <span className={s.heroLabel}>HAC Cleared Hospitals</span>
              <span className={s.heroDesc}>No patient safety payment reductions</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#10b981' }}>
                {avgNationalStar ? `${avgNationalStar}★` : '—'}
              </span>
              <span className={s.heroLabel}>Avg Patient Rating</span>
              <span className={s.heroDesc}>National HCAHPS average</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#60a5fa' }}>
                {medianPsi != null ? medianPsi.toFixed(2) : '—'}
              </span>
              <span className={s.heroLabel}>Median PSI-90 Score</span>
              <span className={s.heroDesc}>Composite patient safety indicator</span>
            </div>
            <div className={s.heroCard}>
              <span className={s.heroValue} style={{ color: '#a78bfa' }}>
                {pctAboveAvgStar != null ? `${pctAboveAvgStar}%` : '—'}
              </span>
              <span className={s.heroLabel}>4★+ Facilities</span>
              <span className={s.heroDesc}>Above national average patient rating</span>
            </div>
          </>
        )}
      </div>

      {/* ── Spotlight: best in each category ── */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>★ Spotlight — Top Performers by Category</span>
        <span className={s.sectionLabelLine} />
      </div>

      {coreLoading ? (
        <div className={s.spotlightGrid}>
          <Skeleton height={180} />
          <Skeleton height={180} />
          <Skeleton height={180} />
        </div>
      ) : (
        <div className={s.spotlightGrid}>

          {/* Best Star Rating */}
          <div
            className={`${s.spotlightCard} ${s.spotlightGold}`}
            onClick={() => bestStar && navigate(`/hospitals/${bestStar.facility_id}`)}
            title={bestStar ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Patient Experience · Highest Rating</div>
            <div className={s.spotlightMetric} style={{ color: '#f59e0b' }}>
              {bestStar ? `${Number(bestStar.star_rating).toFixed(1)}★` : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>HCAHPS patient star rating</div>
            <div className={s.spotlightName}>{bestStar?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{bestStar ? `${bestStar.city}, ${bestStar.state}` : ''}</div>
            {bestStar && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightPraise}>
                  Earned <strong>{Number(bestStar.star_rating).toFixed(1)} stars</strong> from patients — placing it in
                  the top tier for communication, care coordination, and overall experience.
                </div>
              </>
            )}
          </div>

          {/* Safest (lowest PSI-90) */}
          <div
            className={`${s.spotlightCard} ${s.spotlightEmerald}`}
            onClick={() => safest && navigate(`/hospitals/${safest.facility_id}`)}
            title={safest ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Patient Safety · Lowest PSI-90</div>
            <div className={s.spotlightMetric} style={{ color: '#10b981' }}>
              {safest?.psi_90_score != null ? Number(safest.psi_90_score).toFixed(2) : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>composite patient safety score</div>
            <div className={s.spotlightName}>{safest?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{safest ? `${safest.city}, ${safest.state}` : ''}</div>
            {safest && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightPraise}>
                  PSI-90 score of <strong>{Number(safest.psi_90_score).toFixed(2)}</strong> — among the
                  lowest rates of preventable complications, infections, and in-hospital adverse events.
                </div>
              </>
            )}
          </div>

          {/* Best Readmission Rate */}
          <div
            className={`${s.spotlightCard} ${s.spotlightBlue}`}
            onClick={() => bestReadm && navigate(`/hospitals/${bestReadm.facility_id}`)}
            title={bestReadm ? 'View hospital detail' : ''}
          >
            <div className={s.spotlightTag}>Readmissions · Best Ratio</div>
            <div className={s.spotlightMetric} style={{ color: '#60a5fa' }}>
              {bestReadm?.avg_excess_readm_ratio != null
                ? Number(bestReadm.avg_excess_readm_ratio).toFixed(3)
                : '—'}
            </div>
            <div className={s.spotlightMetricLabel}>avg excess readmission ratio</div>
            <div className={s.spotlightName}>{bestReadm?.facility_name || '—'}</div>
            <div className={s.spotlightLoc}>{bestReadm ? `${bestReadm.city}, ${bestReadm.state}` : ''}</div>
            {bestReadm && (
              <>
                <div className={s.spotlightRule} />
                <div className={s.spotlightPraise}>
                  Readmission ratio of <strong>{Number(bestReadm.avg_excess_readm_ratio).toFixed(3)}</strong> — patients
                  are getting it right the first time, with exceptionally low rates of return hospitalizations.
                </div>
              </>
            )}
          </div>

        </div>
      )}

      {/* ── Excellence Honor Roll ── */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>🏆 Excellence Honor Roll — Top 25 Composite Score</span>
        <span className={s.sectionLabelLine} />
      </div>

      {coreLoading ? <Skeleton height={400} /> : (
        <div className={s.tablePanel}>
          <div className={s.tablePanelHeader}>
            <div className={s.tablePanelTitle}>Composite Excellence Rankings</div>
            <div className={s.tablePanelSubtitle}>
              Weighted score: 30% star rating · 30% patient safety · 25% readmissions · 15% mortality
            </div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.rankCell}>#</th>
                  <th>Hospital</th>
                  <th>State</th>
                  <th>Stars</th>
                  <th>PSI-90</th>
                  <th>Readm.</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {honorRoll.map((r, i) => (
                  <tr
                    key={r.facility_id}
                    className={s.clickableRow}
                    style={rowGreen(r.excellence, maxExcellence)}
                    onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                  >
                    <td className={s.rankCell}>
                      {medal(i + 1) ? (
                        <span title={`#${i + 1}`}>{medal(i + 1)}</span>
                      ) : i + 1}
                    </td>
                    <td className={s.nameCell}>{r.facility_name}</td>
                    <td className={s.stateCell}>{r.state}</td>
                    <td>
                      <span
                        className={`${s.starBadge} ${
                          r.star_rating >= 5 ? s.badgeGold :
                          r.star_rating >= 4 ? s.badgeEmerald :
                          s.badgeBlue
                        }`}
                      >
                        {Number(r.star_rating).toFixed(1)}★
                      </span>
                    </td>
                    <td className={s.monoCell} style={{ color: '#10b981' }}>
                      {fmtPsi(r.psi_90_score)}
                    </td>
                    <td className={s.monoCell} style={{ color: '#60a5fa' }}>
                      {fmtRatio(r.avg_excess_readm_ratio)}
                    </td>
                    <td className={`${s.scoreCell} ${excellenceBadge(r.excellence)}`}>
                      {r.excellence.toFixed(1)}
                    </td>
                  </tr>
                ))}
                {!honorRoll.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '32px' }}>
                      No qualifying facilities found for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Safety Leaders ── */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>🛡 Safety Leaders — Lowest PSI-90 Scores</span>
        <span className={s.sectionLabelLine} />
      </div>

      {loadSafe ? <Skeleton height={280} /> : (
        <div className={s.tablePanel}>
          <div className={s.tablePanelHeader}>
            <div className={s.tablePanelTitle}>Patient Safety Excellence</div>
            <div className={s.tablePanelSubtitle}>
              Lowest composite PSI-90 scores — fewest preventable complications and adverse events
            </div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.rankCell}>#</th>
                  <th>Hospital</th>
                  <th>State</th>
                  <th>Stars</th>
                  <th>PSI-90 Score</th>
                  <th>HAC Penalty</th>
                </tr>
              </thead>
              <tbody>
                {(safeData || [])
                  .filter(r => Number(r.psi_90_score) > 0)
                  .slice(0, 15)
                  .map((r, i) => (
                    <tr
                      key={r.facility_id}
                      className={s.clickableRow}
                      onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    >
                      <td className={s.rankCell}>{i + 1}</td>
                      <td className={s.nameCell}>{r.facility_name}</td>
                      <td className={s.stateCell}>{r.state}</td>
                      <td>
                        {r.star_rating ? (
                          <span style={{ color: starColor(Number(r.star_rating)), fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                            {Number(r.star_rating).toFixed(1)}★
                          </span>
                        ) : '—'}
                      </td>
                      <td className={s.monoCell} style={{ color: '#10b981' }}>
                        {fmtPsi(r.psi_90_score)}
                      </td>
                      <td className={s.monoCell}>
                        {r.hac_payment_reduction === 'No' || r.hac_payment_reduction === null
                          ? <span style={{ color: '#10b981', fontWeight: 600 }}>✓ None</span>
                          : <span style={{ color: '#ef4444' }}>Penalized</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Readmission Champions ── */}
      <div className={s.sectionLabel}>
        <span className={s.sectionLabelText}>💙 Readmission Champions — Best Follow-Through Care</span>
        <span className={s.sectionLabelLine} />
      </div>

      {loadStar ? <Skeleton height={280} /> : (
        <div className={s.tablePanel}>
          <div className={s.tablePanelHeader}>
            <div className={s.tablePanelTitle}>Lowest Readmission Ratios</div>
            <div className={s.tablePanelSubtitle}>
              Facilities where patients recover right the first time — excess readmission ratio below 1.0
            </div>
          </div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.rankCell}>#</th>
                  <th>Hospital</th>
                  <th>State</th>
                  <th>Stars</th>
                  <th>Excess Readm. Ratio</th>
                  <th>Mortality Rate</th>
                </tr>
              </thead>
              <tbody>
                {(starData || [])
                  .filter(r => Number(r.avg_excess_readm_ratio) > 0 && Number(r.avg_excess_readm_ratio) < 1.0)
                  .sort((a, b) => Number(a.avg_excess_readm_ratio) - Number(b.avg_excess_readm_ratio))
                  .slice(0, 15)
                  .map((r, i) => (
                    <tr
                      key={r.facility_id}
                      className={s.clickableRow}
                      onClick={() => navigate(`/hospitals/${r.facility_id}`)}
                    >
                      <td className={s.rankCell}>{i + 1}</td>
                      <td className={s.nameCell}>{r.facility_name}</td>
                      <td className={s.stateCell}>{r.state}</td>
                      <td>
                        {r.star_rating ? (
                          <span style={{ color: starColor(Number(r.star_rating)), fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                            {Number(r.star_rating).toFixed(1)}★
                          </span>
                        ) : '—'}
                      </td>
                      <td className={s.monoCell} style={{ color: '#60a5fa' }}>
                        {fmtRatio(r.avg_excess_readm_ratio)}
                      </td>
                      <td className={s.monoCell} style={{ color: 'var(--text-secondary)' }}>
                        {r.avg_mortality_rate != null ? `${Number(r.avg_mortality_rate).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

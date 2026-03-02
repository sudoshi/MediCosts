import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import DRGSelector from '../components/DRGSelector';
import SummaryCards from '../components/SummaryCards';
import DrilldownMap from '../components/DrilldownMap';
import Top50DRGChart from '../components/Top50DRGChart';
import CostVsQualityScatter from '../components/CostVsQualityScatter';
import ZipTable from '../components/ZipTable';
import ScatterPlot from '../components/ScatterPlot';
import Panel from '../components/Panel';
import Skeleton from '../components/ui/Skeleton';
import { fmtNumber } from '../utils/format';
import s from './OverviewView.module.css';

export default function OverviewView() {
  const navigate = useNavigate();
  const [selectedDrg, setSelectedDrg] = useState('ALL');
  const [metric, setMetric] = useState('payment');
  const { data: drgs, loading: drgsLoading, error: drgsError } = useApi('/drgs/top50', []);
  const { data: accountability } = useApi('/quality/accountability/summary');
  const { data: worstMarkups } = useApi('/quality/accountability/markups?limit=5');
  const { data: penalties } = useApi('/quality/readmissions/penalties?limit=5');

  if (drgsLoading || !drgs) {
    return (
      <div className="loading">
        {drgsError ? (
          <>
            <p className="error-msg">Failed to load data: {drgsError}</p>
            <p className="error-hint">
              Ensure the API server is running and PostgreSQL is populated (run{' '}
              <code>npm run load-data</code>).
            </p>
          </>
        ) : (
          <>
            <div className="loading-spinner" />
            <span className="loading-text">Loading dashboard data…</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* Shock Stats Hero */}
      <header className={s.heroSection}>
        <h1 className={s.heroTitle}>The Truth About Healthcare Costs</h1>
        <p className={s.heroSubtitle}>Real Medicare data. No spin. No hiding.</p>
        <div className={s.shockGrid}>
          {accountability ? (
            <>
              <div className={s.shockCard}>
                <span className={s.shockValue} style={{ color: '#ef4444' }}>
                  {accountability.national_markup ? `${accountability.national_markup}x` : '—'}
                </span>
                <span className={s.shockLabel}>Average Hospital Markup</span>
                <span className={s.shockDesc}>What hospitals charge vs. what Medicare pays</span>
              </div>
              <div className={s.shockCard}>
                <span className={s.shockValue} style={{ color: '#f59e0b' }}>
                  {fmtNumber(accountability.hospitals_penalized)}
                </span>
                <span className={s.shockLabel}>Hospitals Penalized</span>
                <span className={s.shockDesc}>For sending patients back too soon</span>
              </div>
              <div className={s.shockCard}>
                <span className={s.shockValue} style={{ color: '#ef4444' }}>
                  {fmtNumber(accountability.hac_penalized)}
                </span>
                <span className={s.shockLabel}>Safety Failures</span>
                <span className={s.shockDesc}>Hospitals with HAC payment reductions</span>
              </div>
              <div className={s.shockCard}>
                <span className={s.shockValue} style={{ color: '#ec4899' }}>
                  {accountability.avg_patient_star ? `${accountability.avg_patient_star}/5` : '—'}
                </span>
                <span className={s.shockLabel}>Avg Patient Rating</span>
                <span className={s.shockDesc}>National HCAHPS satisfaction score</span>
              </div>
            </>
          ) : <Skeleton height={100} />}
        </div>
      </header>

      {/* Patient Journey Cards */}
      <div className={s.journeyRow}>
        <button className={s.journeyCard} onClick={() => navigate('/hospitals')}>
          <span className={s.journeyIcon}>🏥</span>
          <span className={s.journeyTitle}>Find a Hospital</span>
          <span className={s.journeyDesc}>Search, filter, and compare hospitals by quality and cost</span>
        </button>
        <button className={s.journeyCard} onClick={() => navigate('/for-patients')}>
          <span className={s.journeyIcon}>📋</span>
          <span className={s.journeyTitle}>Know Before You Go</span>
          <span className={s.journeyDesc}>Upload records and let Abby find the best care near you</span>
        </button>
        <button className={s.journeyCard} onClick={() => navigate('/compare')}>
          <span className={s.journeyIcon}>⚖️</span>
          <span className={s.journeyTitle}>Compare Hospitals</span>
          <span className={s.journeyDesc}>Side-by-side comparison of cost, quality, and safety</span>
        </button>
        <button className={s.journeyCard} onClick={() => navigate('/accountability')}>
          <span className={s.journeyIcon}>🔦</span>
          <span className={s.journeyTitle}>Accountability</span>
          <span className={s.journeyDesc}>See the worst offenders — markups, penalties, and failures</span>
        </button>
      </div>

      {/* Worst Offenders Preview */}
      <div className={s.offendersRow}>
        <Panel title="Worst Price Gougers">
          {worstMarkups?.length > 0 ? (
            <div className={s.offenderList}>
              {worstMarkups.map(r => (
                <div key={r.facility_id} className={s.offenderItem} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                  <div className={s.offenderInfo}>
                    <span className={s.offenderName}>{r.facility_name}</span>
                    <span className={s.offenderCity}>{r.city}, {r.state}</span>
                  </div>
                  <span className={s.offenderBadge} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                    {Number(r.markup_ratio).toFixed(1)}x markup
                  </span>
                </div>
              ))}
              <button className={s.seeAll} onClick={() => navigate('/accountability')}>See all →</button>
            </div>
          ) : <Skeleton height={200} />}
        </Panel>
        <Panel title="Worst Readmission Penalties">
          {penalties?.length > 0 ? (
            <div className={s.offenderList}>
              {penalties.map((r, i) => (
                <div key={`${r.facility_id}-${i}`} className={s.offenderItem} onClick={() => navigate(`/hospitals/${r.facility_id}`)}>
                  <div className={s.offenderInfo}>
                    <span className={s.offenderName}>{r.facility_name}</span>
                    <span className={s.offenderCity}>{r.state} — {r.measure_name?.replace(/-HRRP$/, '').replace(/^READM-30-/, '')}</span>
                  </div>
                  <span className={s.offenderBadge} style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                    {Number(r.excess_readmission_ratio).toFixed(4)}
                  </span>
                </div>
              ))}
              <button className={s.seeAll} onClick={() => navigate('/accountability')}>See all →</button>
            </div>
          ) : <Skeleton height={200} />}
        </Panel>
      </div>

      {/* Cost vs Quality Scatter — the crown jewel */}
      <CostVsQualityScatter drg={selectedDrg} />

      {/* Existing drill-down sections */}
      <SummaryCards drg={selectedDrg} />
      <DrilldownMap drg={selectedDrg} metric={metric} />
      <DRGSelector
        drgs={drgs}
        selectedDrg={selectedDrg}
        onDrgChange={setSelectedDrg}
        metric={metric}
        onMetricChange={setMetric}
      />
      <Top50DRGChart drgs={drgs} metric={metric} onDrgSelect={setSelectedDrg} />
      <ScatterPlot drg={selectedDrg} />
      <ZipTable drg={selectedDrg} metric={metric} />
      <footer className="footer">
        <p>Data: CMS Medicare Inpatient, Outpatient, Physician & Other Practitioners (Data Year 2023)</p>
        <p>Hospital Star Ratings, HCAHPS Patient Surveys, Census ACS 5-Year Demographics</p>
        <p>Prices reflect averages across providers within each ZIP code.</p>
        <p className="powered-by">Powered by <span>Acumenus Data Sciences</span></p>
      </footer>
    </div>
  );
}

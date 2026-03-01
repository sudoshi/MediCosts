import { useState } from 'react';
import { useApi } from '../hooks/useApi.js';
import DrilldownMap from '../components/DrilldownMap.jsx';
import Panel from '../components/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency } from '../utils/format.js';
import s from './GeographicAnalysis.module.css';

export default function GeographicAnalysis() {
  const [selectedDrg, setSelectedDrg] = useState('');
  const { data: stateQuality, loading: loadingQuality } = useApi('/quality/state-summary');
  const { data: drgs } = useApi('/drgs/top50');

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Geographic Analysis</h1>
        <p className={s.subtitle}>Cost and quality variation across the United States</p>
      </header>

      <div className={s.mapSection}>
        <DrilldownMap drg={selectedDrg} metric="avg_total_payments" />
      </div>

      {drgs && (
        <Panel title="Select a DRG to view on map">
          <select className={s.drgSelect} value={selectedDrg} onChange={(e) => setSelectedDrg(e.target.value)}>
            <option value="">All DRGs (National Average)</option>
            {drgs.map((d) => (
              <option key={d.drg_cd} value={d.drg_cd}>{d.drg_cd} — {d.drg_desc}</option>
            ))}
          </select>
        </Panel>
      )}

      {/* State Quality Heatmap Table */}
      {loadingQuality ? <Skeleton height={300} /> : stateQuality?.length > 0 && (
        <Panel title="State Quality Comparison">
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>State</th>
                  <th>Hospitals</th>
                  <th>Avg Stars</th>
                  <th>CLABSI SIR</th>
                  <th>PSI-90</th>
                  <th>Readm Ratio</th>
                  <th>Mortality %</th>
                  <th>Avg Payment</th>
                  <th>Discharges</th>
                </tr>
              </thead>
              <tbody>
                {stateQuality.map((r) => (
                  <tr key={r.state}>
                    <td className={s.stateCell}>{r.state}</td>
                    <td className={s.mono}>{r.num_hospitals}</td>
                    <td className={s.mono}>
                      <span className={s.starBar} style={{ '--pct': `${Number(r.avg_star_rating) / 5 * 100}%` }}>
                        {Number(r.avg_star_rating).toFixed(1)}
                      </span>
                    </td>
                    <td className={s.mono}>{r.avg_clabsi_sir ? Number(r.avg_clabsi_sir).toFixed(3) : '—'}</td>
                    <td className={s.mono}>{r.avg_psi_90 ? Number(r.avg_psi_90).toFixed(4) : '—'}</td>
                    <td className={s.mono}>{r.avg_excess_readm_ratio ? Number(r.avg_excess_readm_ratio).toFixed(4) : '—'}</td>
                    <td className={s.mono}>{r.avg_mortality_rate ? `${Number(r.avg_mortality_rate).toFixed(1)}%` : '—'}</td>
                    <td className={s.mono}>{fmtCurrency(r.avg_payment)}</td>
                    <td className={s.mono}>{Number(r.total_discharges).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

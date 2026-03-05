import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { fmtCurrency, fmtNumber, fmtStars, fmtRate } from '../utils/format.js';
import s from './PostAcuteCare.module.css';

function exportCsv(rows, filename) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

function ExportBtn({ data, filename }) {
  return (
    <button className={s.exportBtn} onClick={() => exportCsv(data, filename)} title="Export CSV">
      ↓ CSV
    </button>
  );
}

const TABS = [
  { id: 'landscape', label: 'Landscape' },
  { id: 'nursing',   label: 'Nursing Homes' },
  { id: 'hh',        label: 'Home Health' },
  { id: 'hospice',   label: 'Hospice' },
  { id: 'dialysis',  label: 'Dialysis' },
  { id: 'irf',       label: 'Rehab (IRF)' },
  { id: 'ltch',      label: 'Long-Term Care' },
];

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function PostAcuteCare() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('landscape');
  const [state, setState] = useState('');
  const stateQ = state ? `?state=${state}` : '';

  const { data: landscape, loading: loadLand } = useApi(`/post-acute/landscape${stateQ}`, [state]);
  const { data: nursing, loading: loadNH } = useApi(
    tab === 'nursing' ? `/post-acute/nursing-homes${stateQ}&limit=200`.replace('?&', '?') : null, [tab, state]
  );
  const { data: hh, loading: loadHH } = useApi(
    tab === 'hh' ? `/post-acute/home-health${stateQ}&limit=200`.replace('?&', '?') : null, [tab, state]
  );
  const { data: hospice, loading: loadHosp } = useApi(
    tab === 'hospice' ? `/post-acute/hospice${stateQ}&limit=500`.replace('?&', '?') : null, [tab, state]
  );
  const { data: dialysis, loading: loadDia } = useApi(
    tab === 'dialysis' ? `/post-acute/dialysis${stateQ}&limit=200`.replace('?&', '?') : null, [tab, state]
  );
  const { data: irf, loading: loadIRF } = useApi(
    tab === 'irf' ? `/facilities/irf${stateQ}` : null, [tab, state]
  );
  const { data: ltch, loading: loadLTCH } = useApi(
    tab === 'ltch' ? `/facilities/ltch${stateQ}` : null, [tab, state]
  );

  // Build useApi path with proper query string
  const buildPath = (base, params) => {
    const parts = [];
    if (state) parts.push(`state=${state}`);
    Object.entries(params).forEach(([k, v]) => parts.push(`${k}=${v}`));
    return parts.length ? `${base}?${parts.join('&')}` : base;
  };

  // Aggregate hospice data by facility
  const hospiceFacilities = (() => {
    if (!hospice) return [];
    const map = new Map();
    for (const r of hospice) {
      if (!map.has(r.provider_ccn)) {
        map.set(r.provider_ccn, { ...r, measures: [] });
      }
      map.get(r.provider_ccn).measures.push({ measure_code: r.measure_code, measure_name: r.measure_name, score: r.score });
    }
    return [...map.values()];
  })();

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Post-Acute Care</h1>
        <p className={s.subtitle}>Nursing homes, home health, hospice, dialysis &amp; rehabilitation facilities</p>
      </header>

      <div className={s.toolbar}>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>State</span>
          <select className={s.select} value={state} onChange={e => setState(e.target.value)}>
            <option value="">All States</option>
            {STATES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>

      <Tabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

      {/* ── Landscape ── */}
      {tab === 'landscape' && (
        <Panel title="Post-Acute Care Landscape" headerRight={<ExportBtn data={landscape} filename={`landscape-${state || 'all'}.csv`} />}>
          {loadLand ? <Skeleton height={200} /> : landscape?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>State</th>
                    <th>Nursing Homes</th>
                    <th>Home Health</th>
                    <th>Dialysis</th>
                    <th>Hospice</th>
                    <th>IRF</th>
                    <th>LTCH</th>
                  </tr>
                </thead>
                <tbody>
                  {landscape.map(r => (
                    <tr key={r.state}>
                      <td className={s.name}>{r.state}</td>
                      <td className={s.mono}>{fmtNumber(r.nursing_homes)}</td>
                      <td className={s.mono}>{fmtNumber(r.home_health_agencies)}</td>
                      <td className={s.mono}>{fmtNumber(r.dialysis_facilities)}</td>
                      <td className={s.mono}>{fmtNumber(r.hospice_providers)}</td>
                      <td className={s.mono}>{fmtNumber(r.irf_facilities)}</td>
                      <td className={s.mono}>{fmtNumber(r.ltch_facilities)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>No landscape data available.</p>}
        </Panel>
      )}

      {/* ── Nursing Homes ── */}
      {tab === 'nursing' && (
        <Panel title="Nursing Homes" headerRight={<ExportBtn data={nursing} filename={`nursing-homes-${state || 'all'}.csv`} />}>
          {loadNH ? <Skeleton height={400} /> : nursing?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th>Overall</th>
                    <th>Staffing</th>
                    <th>Beds</th>
                    <th>RN Hrs/Res</th>
                    <th>Fines</th>
                  </tr>
                </thead>
                <tbody>
                  {nursing.map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/nursing-homes/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.provider_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.stars}>{fmtStars(r.overall_rating)}</td>
                      <td className={s.stars}>{fmtStars(r.staffing_rating)}</td>
                      <td className={s.mono}>{fmtNumber(r.number_of_beds)}</td>
                      <td className={s.mono}>{r.rn_hours_per_resident != null ? Number(r.rn_hours_per_resident).toFixed(2) : '—'}</td>
                      <td className={s.mono}>{r.total_fines_dollars ? fmtCurrency(r.total_fines_dollars) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view nursing homes.</p>}
        </Panel>
      )}

      {/* ── Home Health ── */}
      {tab === 'hh' && (
        <Panel title="Home Health Agencies" headerRight={<ExportBtn data={hh} filename={`home-health-${state || 'all'}.csv`} />}>
          {loadHH ? <Skeleton height={400} /> : hh?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th>Quality Stars</th>
                    <th>DTC Rate</th>
                    <th>PPR Rate</th>
                    <th>$/Episode</th>
                  </tr>
                </thead>
                <tbody>
                  {hh.map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/home-health/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.provider_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.stars}>{fmtStars(r.quality_star_rating)}</td>
                      <td className={s.mono}>{fmtRate(r.dtc_rate)}</td>
                      <td className={s.mono}>{fmtRate(r.ppr_rate)}</td>
                      <td className={s.mono}>{fmtCurrency(r.medicare_spend_per_episode)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view home health agencies.</p>}
        </Panel>
      )}

      {/* ── Hospice ── */}
      {tab === 'hospice' && (
        <Panel title="Hospice Providers" headerRight={<ExportBtn data={hospiceFacilities} filename={`hospice-${state || 'all'}.csv`} />}>
          {loadHosp ? <Skeleton height={400} /> : hospiceFacilities.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th>Measures</th>
                  </tr>
                </thead>
                <tbody>
                  {hospiceFacilities.slice(0, 200).map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/hospice/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.mono}>{r.measures.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view hospice providers.</p>}
        </Panel>
      )}

      {/* ── Dialysis ── */}
      {tab === 'dialysis' && (
        <Panel title="Dialysis Facilities" headerRight={<ExportBtn data={dialysis} filename={`dialysis-${state || 'all'}.csv`} />}>
          {loadDia ? <Skeleton height={400} /> : dialysis?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th>Stars</th>
                    <th>Mortality</th>
                    <th>Hospitalization</th>
                    <th>Readmission</th>
                    <th>Stations</th>
                  </tr>
                </thead>
                <tbody>
                  {dialysis.map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/dialysis/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.facility_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.stars}>{fmtStars(r.five_star)}</td>
                      <td className={s.mono}>{r.mortality_rate != null ? Number(r.mortality_rate).toFixed(2) : '—'}</td>
                      <td className={s.mono}>{r.hospitalization_rate != null ? Number(r.hospitalization_rate).toFixed(2) : '—'}</td>
                      <td className={s.mono}>{r.readmission_rate != null ? Number(r.readmission_rate).toFixed(2) : '—'}</td>
                      <td className={s.mono}>{fmtNumber(r.num_stations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view dialysis facilities.</p>}
        </Panel>
      )}

      {/* ── IRF ── */}
      {tab === 'irf' && (
        <Panel title="Inpatient Rehabilitation Facilities" headerRight={<ExportBtn data={irf} filename={`irf-${state || 'all'}.csv`} />}>
          {loadIRF ? <Skeleton height={400} /> : irf?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th className={s.thLeft}>County</th>
                    <th className={s.thLeft}>Ownership</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {irf.map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/irf/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.provider_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.city}>{r.county}</td>
                      <td className={s.city}>{r.ownership_type}</td>
                      <td className={s.mono}>{r.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view rehabilitation facilities.</p>}
        </Panel>
      )}

      {/* ── LTCH ── */}
      {tab === 'ltch' && (
        <Panel title="Long-Term Care Hospitals" headerRight={<ExportBtn data={ltch} filename={`ltch-${state || 'all'}.csv`} />}>
          {loadLTCH ? <Skeleton height={400} /> : ltch?.length > 0 ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thLeft}>Name</th>
                    <th className={s.thLeft}>City</th>
                    <th className={s.thLeft}>County</th>
                    <th>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {ltch.map(r => (
                    <tr key={r.provider_ccn} className={s.clickableRow} onClick={() => navigate(`/ltch/${r.provider_ccn}`)}>
                      <td className={s.name}>{r.provider_name}</td>
                      <td className={s.city}>{r.city}, {r.state}</td>
                      <td className={s.city}>{r.county}</td>
                      <td className={s.mono}>{r.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={s.emptyMsg}>Select a state to view long-term care hospitals.</p>}
        </Panel>
      )}
    </div>
  );
}

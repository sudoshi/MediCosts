import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi.js';
import Panel from '../components/Panel.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import s from './ClinicianProfile.module.css';

const fmt$ = (v) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtN = (v) => v == null ? '—' : Number(v).toLocaleString();

export default function ClinicianProfile() {
  const { npi } = useParams();
  const navigate = useNavigate();
  const { data: raw, loading } = useApi(`/clinicians/${npi}`, [npi]);
  const { data: payments } = useApi(`/payments/physician/${npi}`, [npi]);
  const { data: networkData } = useApi(`/network/check?npi=${npi}`, [npi]);

  if (loading) {
    return (
      <div className={s.page}>
        <Skeleton height={120} />
        <Skeleton height={200} />
      </div>
    );
  }

  // API returns single object or array (NPI not unique — multiple practice locations)
  const data = Array.isArray(raw) ? raw[0] : raw;

  if (!data) {
    return (
      <div className={s.page}>
        <div className={s.notFound}>
          <h2>Clinician Not Found</h2>
          <p>No data for NPI: {npi}</p>
          <button className={s.backBtn} onClick={() => navigate('/clinicians')}>Back to Directory</button>
        </div>
      </div>
    );
  }

  const c = data;
  const fullName = [c.first_name, c.middle_name, c.last_name, c.suffix].filter(Boolean).join(' ');
  const displayName = c.credential ? `${fullName}, ${c.credential}` : fullName;

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/clinicians')}>
        ← Back to Clinician Directory
      </button>

      {/* Hero */}
      <div className={s.heroCard}>
        <div className={s.heroMain}>
          <h1 className={s.heroName}>{displayName}</h1>
          <div className={s.heroMeta}>
            {c.primary_specialty && <span>{c.primary_specialty}</span>}
            {c.city && (
              <>
                <span className={s.dot}>·</span>
                <span>{c.city}, {c.state}</span>
              </>
            )}
          </div>
          <div className={s.heroBadges}>
            {c.telehealth && <Badge variant="info">Telehealth</Badge>}
            {c.ind_assignment && <Badge variant="better">Individual Assignment</Badge>}
            {c.group_assignment && <Badge variant="better">Group Assignment</Badge>}
          </div>
        </div>
      </div>

      <div className={s.grid}>
        {/* Professional Info */}
        <Panel title="Professional Info">
          <div className={s.metricList}>
            <MetricRow label="NPI" value={c.npi} />
            <MetricRow label="Primary Specialty" value={c.primary_specialty || '—'} />
            {c.secondary_specialty_1 && <MetricRow label="Secondary Specialty" value={c.secondary_specialty_1} />}
            {c.secondary_specialty_2 && <MetricRow label="Additional Specialty" value={c.secondary_specialty_2} />}
            <MetricRow label="Credential" value={c.credential || '—'} />
            <MetricRow label="Gender" value={c.gender || '—'} />
          </div>
        </Panel>

        {/* Education */}
        <Panel title="Education">
          <div className={s.metricList}>
            <MetricRow label="Medical School" value={c.medical_school || '—'} />
            <MetricRow label="Graduation Year" value={c.graduation_year || '—'} />
          </div>
        </Panel>

        {/* Practice Location */}
        <Panel title="Practice Location">
          <div className={s.metricList}>
            <MetricRow label="Facility Name" value={c.facility_name || '—'} />
            <MetricRow label="City" value={c.city || '—'} />
            <MetricRow label="State" value={c.state || '—'} />
            <MetricRow label="ZIP Code" value={c.zip_code || '—'} />
          </div>
        </Panel>

        {/* Medicare Enrollment */}
        <Panel title="Medicare Enrollment">
          <div className={s.metricList}>
            <div className={s.metricRow}>
              <span className={s.metricName}>Telehealth</span>
              <Badge variant={c.telehealth ? 'better' : 'neutral'}>{c.telehealth ? 'Yes' : 'No'}</Badge>
            </div>
            <div className={s.metricRow}>
              <span className={s.metricName}>Individual Assignment</span>
              <Badge variant={c.ind_assignment ? 'better' : 'neutral'}>{c.ind_assignment ? 'Yes' : 'No'}</Badge>
            </div>
            <div className={s.metricRow}>
              <span className={s.metricName}>Group Assignment</span>
              <Badge variant={c.group_assignment ? 'better' : 'neutral'}>{c.group_assignment ? 'Yes' : 'No'}</Badge>
            </div>
          </div>
        </Panel>
      </div>

      {/* Industry Payments */}
      {payments?.summary?.total_payments > 0 && (
        <Panel title="Industry Payments — Sunshine Act" style={{ gridColumn: '1 / -1' }}>
          <div className={s.paymentSummary}>
            <div className={s.paymentStat}>
              <span className={s.paymentStatLabel}>Total Received</span>
              <span className={s.paymentStatVal}>{fmt$(payments.summary.total_amount)}</span>
            </div>
            <div className={s.paymentStat}>
              <span className={s.paymentStatLabel}>Num Payments</span>
              <span className={s.paymentStatVal}>{fmtN(payments.summary.total_payments)}</span>
            </div>
            <div className={s.paymentStat}>
              <span className={s.paymentStatLabel}>Unique Payers</span>
              <span className={s.paymentStatVal}>{fmtN(payments.summary.unique_payers)}</span>
            </div>
            {payments.summary.years && (
              <div className={s.paymentStat}>
                <span className={s.paymentStatLabel}>Years</span>
                <span className={s.paymentStatVal}>{payments.summary.years.first}–{payments.summary.years.last}</span>
              </div>
            )}
          </div>
          <div className={s.tableWrap}>
            <table className={s.paymentsTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payer</th>
                  <th>Nature</th>
                  <th>Product</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(payments.payments || []).slice(0, 50).map((p) => (
                  <tr key={p.id}>
                    <td className={s.metricValue}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '—'}</td>
                    <td className={s.metricName}>{p.payer_name || '—'}</td>
                    <td className={s.metricMeta}>{p.payment_nature || '—'}</td>
                    <td className={s.metricMeta}>{p.product_name || '—'}</td>
                    <td className={s.metricValue}>{fmt$(p.payment_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Insurance Networks (ClearNetwork) */}
      {networkData && (networkData.networks?.length > 0 ? (
        <Panel title="Insurance Networks — In-Network Status">
          <div className={s.networkRow}>
            {networkData.networks.map((n, i) => (
              <div key={i} className={`${s.networkChip} ${s.networkIn}`}>
                <span className={s.networkDot} />
                <div className={s.networkInfo}>
                  <span className={s.networkName}>{n.network_name}</span>
                  {n.tier && <span className={s.networkTier}>Tier {n.tier}</span>}
                </div>
              </div>
            ))}
          </div>
          <p className={s.networkNote}>
            Source: ClearNetwork — {networkData.networks.length} network{networkData.networks.length !== 1 ? 's' : ''} verified.
            Network status may change; confirm with your insurer before scheduling.
          </p>
        </Panel>
      ) : (
        <Panel title="Insurance Networks — In-Network Status">
          <p className={s.networkNote}>
            This provider was not found in any currently loaded insurance network directory.
            Network participation data is available for BCBS MN, BCBS IL, Kaiser Permanente, and UnitedHealthcare.
          </p>
        </Panel>
      ))}

      {/* Multiple Practice Locations */}
      {Array.isArray(raw) && raw.length > 1 && (
        <Panel title="Additional Practice Locations">
          <div className={s.tableWrap}>
            <table className={s.locTable}>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>City</th>
                  <th>State</th>
                  <th>ZIP</th>
                  <th>Specialty</th>
                </tr>
              </thead>
              <tbody>
                {raw.slice(1).map((loc, i) => (
                  <tr key={i}>
                    <td className={s.metricName}>{loc.facility_name || '—'}</td>
                    <td>{loc.city}</td>
                    <td>{loc.state}</td>
                    <td>{loc.zip_code}</td>
                    <td className={s.metricMeta}>{loc.primary_specialty}</td>
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

function MetricRow({ label, value }) {
  return (
    <div className={s.metricRow}>
      <span className={s.metricName}>{label}</span>
      <span className={s.metricValue}>{value}</span>
    </div>
  );
}

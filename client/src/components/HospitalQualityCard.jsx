import { useApi } from '../hooks/useApi';
import { fmtStars } from '../utils/format';
import OutpatientServices from './OutpatientServices';
import styles from './HospitalQualityCard.module.css';

const STAR_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#fbbf24', 4: '#22c55e', 5: '#3b82f6' };

const HCAHPS_DIMENSIONS = [
  { key: 'nurse_comm_star',      label: 'Nurse Communication' },
  { key: 'doctor_comm_star',     label: 'Doctor Communication' },
  { key: 'staff_responsive_star', label: 'Staff Responsiveness' },
  { key: 'medicine_comm_star',   label: 'Medicine Communication' },
  { key: 'discharge_info_star',  label: 'Discharge Information' },
  { key: 'care_transition_star', label: 'Care Transition' },
  { key: 'cleanliness_star',     label: 'Cleanliness' },
  { key: 'quietness_star',       label: 'Quietness' },
  { key: 'recommend_star',       label: 'Would Recommend' },
];

function StarBadge({ rating, size = 'large' }) {
  if (rating == null) return <span className={styles.noRating}>Not Rated</span>;
  const n = Number(rating);
  const color = STAR_COLORS[n] || '#71717a';
  return (
    <span className={`${styles.starBadge} ${size === 'small' ? styles.starSmall : ''}`} style={{ color }}>
      {fmtStars(n)}
    </span>
  );
}

function DimensionRow({ label, star }) {
  if (star == null) return null;
  const n = Number(star);
  const color = STAR_COLORS[n] || '#71717a';
  return (
    <div className={styles.dimRow}>
      <span className={styles.dimLabel}>{label}</span>
      <span className={styles.dimStars} style={{ color }}>{fmtStars(n)}</span>
    </div>
  );
}

export default function HospitalQualityCard({ ccn }) {
  const { data, loading, error } = useApi(`/quality/hospital/${ccn}`, [ccn]);

  if (loading || !data) {
    return <div className={styles.loading}>Loading quality profile…</div>;
  }

  if (error) {
    return <div className={styles.error}>Failed to load: {error}</div>;
  }

  const { hospital, hcahps } = data;

  if (!hospital) {
    return <div className={styles.loading}>No quality data available for this hospital.</div>;
  }

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.name}>{hospital.facility_name}</h3>
          <p className={styles.address}>
            {hospital.address} · {hospital.city}, {hospital.state} {hospital.zip_code}
          </p>
          <div className={styles.tags}>
            <span className={styles.tag}>{hospital.hospital_type}</span>
            <span className={styles.tag}>{hospital.hospital_ownership}</span>
            {hospital.emergency_services && <span className={`${styles.tag} ${styles.tagEmergency}`}>ER</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.overallLabel}>Overall Rating</div>
          <StarBadge rating={hospital.hospital_overall_rating} />
        </div>
      </div>

      {/* HCAHPS Dimensions */}
      {hcahps && (
        <div className={styles.hcahpsSection}>
          <h4 className={styles.sectionTitle}>Patient Experience (HCAHPS)</h4>
          <div className={styles.dimGrid}>
            {HCAHPS_DIMENSIONS.map((dim) => (
              <DimensionRow key={dim.key} label={dim.label} star={hcahps[dim.key]} />
            ))}
          </div>
        </div>
      )}

      {/* Outpatient Services */}
      <div className={styles.outpatientSection}>
        <h4 className={styles.sectionTitle}>Outpatient Services</h4>
        <OutpatientServices ccn={ccn} />
      </div>
    </div>
  );
}

export { StarBadge };

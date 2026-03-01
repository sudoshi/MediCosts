import styles from './KpiDomainCard.module.css';

export default function KpiDomainCard({ title, value, subtitle, color, dim, active, onClick, icon }) {
  return (
    <button
      className={`${styles.card} ${active ? styles.active : ''}`}
      style={{ '--domain-color': color, '--domain-dim': dim }}
      onClick={onClick}
    >
      <div className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.value}>{value}</div>
      <div className={styles.subtitle}>{subtitle}</div>
    </button>
  );
}

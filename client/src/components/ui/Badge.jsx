import styles from './Badge.module.css';

const VARIANTS = {
  better: styles.better,
  worse: styles.worse,
  same: styles.same,
  neutral: styles.neutral,
  info: styles.info,
  penalized: styles.worse,
  not_penalized: styles.better,
};

export default function Badge({ variant = 'neutral', children }) {
  return (
    <span className={`${styles.badge} ${VARIANTS[variant] || styles.neutral}`}>
      {children}
    </span>
  );
}

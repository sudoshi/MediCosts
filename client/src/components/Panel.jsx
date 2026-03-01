import styles from './Panel.module.css';

export default function Panel({ title, children, className = '' }) {
  return (
    <div className={`${styles.panel} ${className}`}>
      {title && <h3 className={styles.title}>{title}</h3>}
      {children}
    </div>
  );
}

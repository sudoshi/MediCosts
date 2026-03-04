import styles from './Panel.module.css';

export default function Panel({ title, children, className = '', headerRight }) {
  return (
    <div className={`${styles.panel} ${className}`}>
      {(title || headerRight) && (
        <div className={styles.panelHeader}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {headerRight && <div className={styles.headerRight}>{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

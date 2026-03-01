import styles from './Skeleton.module.css';

export default function Skeleton({ width = '100%', height = 20, variant = 'rect' }) {
  const cls = variant === 'circle' ? styles.circle : styles.rect;
  return (
    <div
      className={`${styles.skeleton} ${cls}`}
      style={{ width, height, borderRadius: variant === 'circle' ? '50%' : 6 }}
    />
  );
}

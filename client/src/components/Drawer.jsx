import { useEffect } from 'react';
import styles from './Drawer.module.css';

export default function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.open : ''}`}
        onClick={onClose}
        style={{ pointerEvents: open ? 'auto' : 'none' }}
      />
      <div className={`${styles.drawer} ${open ? styles.open : ''}`}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.body}>
          {children}
        </div>
      </div>
    </>
  );
}

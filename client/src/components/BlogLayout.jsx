import { Link } from 'react-router-dom';
import s from './BlogLayout.module.css';

export default function BlogLayout({ children }) {
  return (
    <div className={s.page}>
      <nav className={s.nav}>
        <Link to="/" className={s.brand}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="var(--accent)" />
            <path d="M17 9h-4V5h-2v4H7v2h4v4h2v-4h4V9z" fill="#09090b" />
          </svg>
          <span className={s.brandName}>MediCosts</span>
          <span className={s.brandSep}>·</span>
          <span className={s.brandSub}>Blog</span>
        </Link>
        <div className={s.navActions}>
          <Link to="/blog" className={s.navLink}>All Posts</Link>
          <Link to="/" className={s.openApp}>Open App →</Link>
        </div>
      </nav>

      <main className={s.main}>{children}</main>

      <footer className={s.footer}>
        <span className={s.footerBrand}>MediCosts</span>
        <span className={s.footerSep}>·</span>
        <span className={s.footerNote}>
          Data: CMS, HRSA, CDC PLACES · No PHI stored · Not affiliated with CMS or any insurer
        </span>
      </footer>
    </div>
  );
}

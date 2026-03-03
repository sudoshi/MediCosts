import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboardIcon, ShieldCheckIcon, BuildingIcon,
  MapIcon, StethoscopeIcon, SparklesIcon, PlugIcon, GearIcon,
  LogoMark, ChevronLeft, ChevronRight, LogOutIcon,
  TrendingUpIcon, HeartPulseIcon, DollarIcon, UsersIcon,
  AlertTriangleIcon, ScaleIcon, ClipboardHeartIcon, SearchDollarIcon,
  InfoIcon, PillIcon, BookOpenIcon,
} from './icons/NavIcons';
import s from './AppShell.module.css';

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { path: '/overview', label: 'Overview', icon: LayoutDashboardIcon },
    ],
  },
  {
    label: 'Quality & Safety',
    items: [
      { path: '/quality',       label: 'Quality Command',  icon: ShieldCheckIcon },
      { path: '/accountability',label: 'Accountability',   icon: AlertTriangleIcon },
      { path: '/compare',       label: 'Compare Hospitals',icon: ScaleIcon },
    ],
  },
  {
    label: 'Cost & Financials',
    items: [
      { path: '/trends',     label: 'Cost Trends',         icon: TrendingUpIcon },
      { path: '/spending',   label: 'Spending & Value',    icon: DollarIcon },
      { path: '/drugs',      label: 'Drug Spending',       icon: PillIcon },
      { path: '/financials', label: 'Hospital Financials', icon: TrendingUpIcon },
      { path: '/payments',   label: 'Industry Payments',   icon: DollarIcon },
    ],
  },
  {
    label: 'Providers',
    items: [
      { path: '/hospitals',  label: 'Hospital Explorer',   icon: BuildingIcon },
      { path: '/clinicians', label: 'Clinician Directory', icon: UsersIcon },
      { path: '/post-acute', label: 'Post-Acute Care',     icon: HeartPulseIcon },
      { path: '/physicians', label: 'Physician Analytics', icon: StethoscopeIcon },
    ],
  },
  {
    label: 'Geography',
    items: [
      { path: '/geography', label: 'Geographic Analysis', icon: MapIcon },
    ],
  },
  {
    label: 'Patient Tools',
    items: [
      { path: '/for-patients', label: 'For Patients',   icon: ClipboardHeartIcon },
      { path: '/estimate',     label: 'Cost Estimator', icon: SearchDollarIcon },
    ],
  },
  {
    label: 'AI & Data',
    items: [
      { path: '/abby',       label: 'Abby Analytics',  icon: SparklesIcon },
      { path: '/connectors', label: 'Data Connectors', icon: PlugIcon },
    ],
  },
  {
    label: null,
    items: [
      { path: '/settings', label: 'Settings',             icon: GearIcon },
      { path: '/blog',     label: 'Blog',                 icon: BookOpenIcon },
      { path: '/about',    label: 'About & Data Sources', icon: InfoIcon },
    ],
  },
];

const NAV_FLAT = NAV_GROUPS.flatMap(g => g.items);

export default function AppShell({ onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const current = NAV_FLAT.find(i => location.pathname.startsWith(i.path));

  return (
    <div className={`${s.shell} ${collapsed ? s.shellCollapsed : ''}`}>
      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div className={s.mobileOverlay} onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`${s.sidebar} ${collapsed ? s.collapsed : ''} ${mobileOpen ? s.mobileOpen : ''}`}>
        <div className={s.logo}>
          <LogoMark />
          {!collapsed && <span className={s.wordmark}>MediCosts</span>}
        </div>

        <nav className={s.nav}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className={s.navGroup}>
              {group.label && (
                <span className={s.navGroupLabel}>{group.label}</span>
              )}
              {!group.label && gi > 0 && (
                <div className={s.navDivider} />
              )}
              {group.items.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `${s.navItem} ${isActive ? s.active : ''}`
                  }
                  title={collapsed ? label : undefined}
                >
                  <Icon />
                  {!collapsed && <span className={s.navLabel}>{label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className={s.sidebarFooter}>
          {onLogout && (
            <button className={s.logoutBtn} onClick={onLogout} title="Sign Out">
              <LogOutIcon />
              {!collapsed && <span>Sign Out</span>}
            </button>
          )}
          <button
            className={s.collapseBtn}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={s.main}>
        {/* Top bar */}
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <button
              className={s.hamburger}
              onClick={() => setMobileOpen(o => !o)}
              title="Open menu"
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect y="3" width="18" height="2" rx="1" fill="currentColor"/>
                <rect y="8" width="18" height="2" rx="1" fill="currentColor"/>
                <rect y="13" width="18" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
            <span className={s.viewName}>{current?.label || 'Dashboard'}</span>
            <span className={s.dataYear}>Data Year 2023</span>
          </div>
          <div className={s.topbarRight}>
            <span className={s.dataBadge}>9M+ Records</span>
          </div>
        </header>

        <div className={s.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

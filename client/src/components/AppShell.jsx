import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboardIcon, ShieldCheckIcon, BuildingIcon,
  MapIcon, StethoscopeIcon, SparklesIcon, GearIcon,
  LogoMark, ChevronLeft, ChevronRight, LogOutIcon,
  TrendingUpIcon, HeartPulseIcon, DollarIcon, UsersIcon,
  AlertTriangleIcon, ScaleIcon, ClipboardHeartIcon, SearchDollarIcon,
  InfoIcon, PillIcon, BookOpenIcon, PlugIcon, AwardIcon,
} from './icons/NavIcons';
import useStats from '../hooks/useStats.js';
import AbbyPanel from './AbbyPanel.jsx';
import s from './AppShell.module.css';

/* ── Nav definition — admin items removed from sidebar ── */
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
      { path: '/quality',        label: 'Quality Command',   icon: ShieldCheckIcon },
      { path: '/excellence',     label: 'Best of the Best',  icon: AwardIcon },
      { path: '/accountability', label: 'Accountability',    icon: AlertTriangleIcon },
      { path: '/compare',        label: 'Compare Hospitals', icon: ScaleIcon },
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
    label: null,
    items: [
      { path: '/blog',  label: 'Blog',                 icon: BookOpenIcon },
      { path: '/about', label: 'About & Data Sources', icon: InfoIcon },
    ],
  },
];

/* Admin-only items that appear in the topbar dropdown */
const ADMIN_ITEMS = [
  { path: '/connectors', label: 'Data Connectors', icon: PlugIcon },
  { path: '/settings',   label: 'Settings',        icon: GearIcon },
];

const NAV_FLAT = NAV_GROUPS.flatMap(g => g.items);

/* ── Page context labels for Abby ── */
const PAGE_CONTEXT_MAP = [
  ['/overview',       'Overview Dashboard'],
  ['/quality',        'Quality Command Center'],
  ['/excellence',     'Best of the Best'],
  ['/accountability', 'Accountability Dashboard'],
  ['/compare',        'Hospital Compare'],
  ['/trends',         'Cost Trends'],
  ['/spending',       'Spending & Value'],
  ['/drugs',          'Drug Spending'],
  ['/financials',     'Hospital Financials'],
  ['/payments',       'Industry Payments'],
  ['/hospitals',      'Hospital Explorer'],
  ['/clinicians',     'Clinician Directory'],
  ['/post-acute',     'Post-Acute Care'],
  ['/physicians',     'Physician Analytics'],
  ['/geography',      'Geographic Analysis'],
  ['/for-patients',   'For Patients'],
  ['/estimate',       'Cost Estimator'],
  ['/about',          'About & Data Sources'],
  ['/blog',           'Blog'],
];

function getPageContext(pathname) {
  for (const [prefix, label] of PAGE_CONTEXT_MAP) {
    if (pathname.startsWith(prefix)) return label;
  }
  return null;
}

const STORAGE_KEY = 'medicosts_nav_open_groups';

function loadOpenGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch { return new Set(); }
}

function saveOpenGroups(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch {}
}

/* Which group label contains a given pathname? */
function groupForPath(pathname) {
  for (const g of NAV_GROUPS) {
    if (!g.label) continue;
    if (g.items.some(i => pathname.startsWith(i.path))) return g.label;
  }
  return null;
}

export default function AppShell({ onLogout, user }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [abbyOpen, setAbbyOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    const stored = loadOpenGroups();
    return stored.size ? stored : new Set();
  });
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef(null);
  const location = useLocation();
  const { fmt } = useStats();

  const isAdmin = user?.role === 'admin';

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Auto-open the group that contains the current route
  useEffect(() => {
    const activeGroup = groupForPath(location.pathname);
    if (activeGroup) {
      setOpenGroups(prev => {
        if (prev.has(activeGroup)) return prev;
        const next = new Set(prev);
        next.add(activeGroup);
        saveOpenGroups(next);
        return next;
      });
    }
  }, [location.pathname]);

  // Close admin dropdown on outside click
  useEffect(() => {
    if (!adminOpen) return;
    function onDown(e) {
      if (adminRef.current && !adminRef.current.contains(e.target)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [adminOpen]);

  function toggleGroup(label) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveOpenGroups(next);
      return next;
    });
  }

  const current = NAV_FLAT.find(i => location.pathname.startsWith(i.path))
    ?? ADMIN_ITEMS.find(i => location.pathname.startsWith(i.path));

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
          {NAV_GROUPS.map((group, gi) => {
            const isOpen = !group.label || openGroups.has(group.label);
            const hasActive = group.items.some(i => location.pathname.startsWith(i.path));

            return (
              <div key={gi} className={s.navGroup}>
                {/* Labeled groups get a collapsible header */}
                {group.label ? (
                  <button
                    className={`${s.navGroupHeader} ${hasActive ? s.navGroupHeaderActive : ''}`}
                    onClick={() => !collapsed && toggleGroup(group.label)}
                    title={collapsed ? group.label : undefined}
                  >
                    <span className={s.navGroupLabel}>{group.label}</span>
                    {!collapsed && (
                      <span className={`${s.groupChevron} ${isOpen ? s.groupChevronOpen : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                ) : (
                  gi > 0 && <div className={s.navDivider} />
                )}

                {/* Items — hidden when group collapsed (unless sidebar itself is collapsed) */}
                <div className={`${s.navGroupItems} ${!isOpen && !collapsed && group.label ? s.navGroupItemsHidden : ''}`}>
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
              </div>
            );
          })}
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
          </div>

          <div className={s.topbarRight}>
            {fmt && <span className={s.dataBadge}>{fmt.totalRecords} Records</span>}

            {/* Ask Abby button */}
            <button
              className={`${s.abbyBtn} ${abbyOpen ? s.abbyBtnActive : ''}`}
              onClick={() => setAbbyOpen(o => !o)}
              title="Ask Abby"
            >
              <SparklesIcon />
              <span>Ask Abby</span>
            </button>

            {/* Admin dropdown — only for admins */}
            {isAdmin && (
              <div className={s.adminDropdown} ref={adminRef}>
                <button
                  className={`${s.adminBtn} ${adminOpen ? s.adminBtnOpen : ''}`}
                  onClick={() => setAdminOpen(o => !o)}
                  title="Admin tools"
                >
                  <GearIcon />
                  <span>Admin</span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`${s.adminChevron} ${adminOpen ? s.adminChevronOpen : ''}`}>
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {adminOpen && (
                  <div className={s.adminMenu}>
                    <div className={s.adminMenuLabel}>Admin Tools</div>
                    {ADMIN_ITEMS.map(({ path, label, icon: Icon }) => (
                      <Link
                        key={path}
                        to={path}
                        className={`${s.adminMenuItem} ${location.pathname.startsWith(path) ? s.adminMenuItemActive : ''}`}
                        onClick={() => setAdminOpen(false)}
                      >
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className={s.content}>
          <Outlet />
        </div>
      </main>

      {/* ── Abby slide-out panel ── */}
      <AbbyPanel
        isOpen={abbyOpen}
        onClose={() => setAbbyOpen(false)}
        pageContext={getPageContext(location.pathname)}
      />
    </div>
  );
}

const icon = (d) => {
  const Ic = (props) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" {...props}>
      {typeof d === 'string' ? <path d={d} /> : d}
    </svg>
  );
  return Ic;
};

export const LayoutDashboardIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </>
);

export const ShieldCheckIcon = icon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </>
);

export const BuildingIcon = icon(
  <>
    <rect x="4" y="2" width="16" height="20" rx="1" />
    <path d="M9 22V18h6v4" />
    <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
  </>
);

export const MapIcon = icon(
  <>
    <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
    <path d="M8 2v16" />
    <path d="M16 6v16" />
  </>
);

export const StethoscopeIcon = icon(
  <>
    <path d="M4.8 2.3A.3.3 0 105 2H4a2 2 0 00-2 2v5a6 6 0 0012 0V4a2 2 0 00-2-2h-1a.2.2 0 10.1.3" />
    <path d="M8 15v1a6 6 0 006 6 6 6 0 006-6v-4" />
    <circle cx="20" cy="10" r="2" />
  </>
);

export const PlugIcon = icon(
  <>
    <path d="M12 22v-5" />
    <path d="M9 8V1h2v3h2V1h2v7" />
    <path d="M5 8h14a1 1 0 011 1v3a8 8 0 01-16 0V9a1 1 0 011-1z" />
  </>
);

export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </>
);

export const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="6" fill="var(--accent)" />
    <path d="M17 9h-4V5h-2v4H7v2h4v4h2v-4h4V9z" fill="var(--bg-deep)" />
  </svg>
);

export const ChevronLeft = icon('M15 18l-6-6 6-6');
export const ChevronRight = icon('M9 18l6-6-6-6');
export const SparklesIcon = icon(
  <>
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
    <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
  </>
);

export const LogOutIcon = icon(
  <>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>
);

export const TrendingUpIcon = icon(
  <>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </>
);

export const HeartPulseIcon = icon(
  <>
    <path d="M19.5 12.572l-7.5 7.428-7.5-7.428A5 5 0 0112 5.006a5 5 0 017.5 7.566z" />
    <path d="M5 12h4l2-3 2 6 2-3h4" />
  </>
);

export const DollarIcon = icon(
  <>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </>
);

export const UsersIcon = icon(
  <>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </>
);

export const AlertTriangleIcon = icon(
  <>
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>
);

export const ScaleIcon = icon(
  <>
    <path d="M16 3h5v5" />
    <path d="M8 3H3v5" />
    <path d="M12 22V8" />
    <path d="M20 3l-8 8-8-8" />
    <path d="M3 16c0 2.8 4 5 9 5s9-2.2 9-5" />
  </>
);

export const SearchDollarIcon = icon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
    <line x1="11" y1="7" x2="11" y2="15" />
    <path d="M13.5 9H10a1.5 1.5 0 000 3h2a1.5 1.5 0 010 3H9.5" />
  </>
);

export const ClipboardHeartIcon = icon(
  <>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    <path d="M12 11a2.5 2.5 0 015 0c0 3-5 5.5-5 5.5S7 14 7 11a2.5 2.5 0 015 0z" />
  </>
);

export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </>
);

export const PillIcon = icon(
  <>
    <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7" />
    <path d="M16 19h6M19 16v6" />
    <path d="M8 12h8M12 8v8" strokeWidth="1.5" />
  </>
);

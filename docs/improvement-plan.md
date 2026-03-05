# MediCosts Page Improvement Plan

**Created:** 2026-03-04
**Status:** In Progress
**Goal:** Systematic improvements to all ~25 pages covering UX, data integrations, visualizations, performance, and design consistency.

---

## Phase 1 — Bug Fixes & Quick Wins
*Targeted, low-risk fixes. High impact-to-effort ratio.*

| # | Page | Fix | Status |
|---|------|-----|--------|
| 1.1 | HospitalDetail | Fix Compare button URL param: `?add=CCN` → `?h=CCN` | [ ] |
| 1.2 | PhysicianAnalytics | Fix ZIP results column name mismatch (`num_providers` vs `total_providers`) | [ ] |
| 1.3 | SpendingValue | Wire correlation heatmap CSV export (button exists, no data passed) | [ ] |
| 1.4 | PostAcuteCare | Show national landscape without requiring state selection | [ ] |
| 1.5 | HospitalExplorer | Add CSV export button + stars filter (≥1–5) | [ ] |
| 1.6 | ClinicianDirectory | Improve empty/loading state messages; clarify OR vs AND filter logic | [ ] |
| 1.7 | FinancialsExplorer | Fix Occupancy metric showing empty table (column not in query) + add CSV export | [ ] |
| 1.8 | HospitalDetail | Add lazy-load for below-fold panels (defer 8+ of 17 API calls) | [ ] |
| 1.9 | OverviewView | Add "Data as of 2023" notice; link Worst Offenders cards to full pages | [ ] |

## Phase 2 — DrugSpending Enhancement
*Drug detail click-through, prescriber drill-down, trend chart. `/api/drugs/detail/:name` already exists.*

| # | Feature | Details | Status |
|---|---------|---------|--------|
| 2.1 | Drug detail slide-over | Click drug row → slide-over panel showing 5-year trend chart (recharts LineChart) from `/api/drugs/detail/:name` | [ ] |
| 2.2 | Top prescribers panel | Slide-over shows top prescribers (specialties + volumes) from `/api/drugs/top-prescribers?limit=10` + link to clinician profiles | [ ] |
| 2.3 | State filter | Add state dropdown → filter by top prescriber state | [ ] |
| 2.4 | CAGR coloring improvement | Color relative to distribution median, not fixed >20% threshold | [ ] |
| 2.5 | CSV export | Export current sorted/filtered list | [ ] |

## Phase 3 — PaymentsExplorer Enhancement
*Debounced search, time-series chart, leaderboard drill-down.*

| # | Feature | Details | Status |
|---|---------|---------|--------|
| 3.1 | Real-time search | Remove submit button; debounce 400ms; show spinner during fetch | [ ] |
| 3.2 | Year-over-year chart | Add BarChart comparing 2023 vs 2024 payment totals per top-10 (by nature/payer) | [ ] |
| 3.3 | Leaderboard drill-down | Click physician row → navigate to `/clinicians/:npi`; click hospital row → `/hospitals/:ccn` | [ ] |
| 3.4 | Payment nature filter | Add nature filter dropdown on leaderboard (Food/Bev, Research, Travel, etc.) | [ ] |
| 3.5 | CSV export | Export current leaderboard view | [ ] |

## Phase 4 — Bulk CSV Exports + Table Improvements
*All major tables get CSV export. Sort state preserved in search.*

| # | Page | Fix | Status |
|---|------|-----|--------|
| 4.1 | AccountabilityDashboard | CSV export on markup, readmissions, HAC, composite tables | [ ] |
| 4.2 | QualityCommandCenter | CSV export on composite quality failure, penalties, HCAHPS state tables | [ ] |
| 4.3 | CostTrends | CSV export for comparison table + national/DRG data | [ ] |
| 4.4 | PostAcuteCare | CSV export per tab (nursing homes, home health, hospice, dialysis, IRF, LTCH) | [ ] |
| 4.5 | HospitalExplorer | Preserve sort when switching between search + pagination | [ ] |
| 4.6 | FinancialsExplorer | Add year-over-year delta column (2023 vs 2024) on summary metrics | [ ] |

## Phase 5 — Clinician & Provider Enhancements
*Dynamic specialty list, payments pagination, opioid metric visibility.*

| # | Page | Feature | Status |
|---|------|---------|--------|
| 5.1 | ClinicianDirectory | Dynamic specialty list from `/api/clinicians/search` distinct values | [ ] |
| 5.2 | ClinicianDirectory | Paginate results (show 25, "Load more" button for next 25) | [ ] |
| 5.3 | ClinicianProfile | Payments pagination — use `page` + `limit` params from `/api/payments/physician/:npi` | [ ] |
| 5.4 | ClinicianProfile | Always show opioid prescriber metric (even if 0, with explanatory note) | [ ] |
| 5.5 | PhysicianAnalytics | Drill-down from ZIP results to `/clinicians?state=ST` with name pre-filled | [ ] |
| 5.6 | ClinicianProfile | Show year-over-year payment trend (2023 vs 2024 totals as mini comparison) | [ ] |

## Phase 6 — Geography & Data Quality
*Sortable state heatmap, better nearby pagination, data-as-of labels.*

| # | Page | Feature | Status |
|---|------|---------|--------|
| 6.1 | GeographicAnalysis | Make state heatmap table columns sortable (avg payment, stars, discharges) | [ ] |
| 6.2 | GeographicAnalysis | Nearby hospitals pagination (20 → 50 limit + "load more") | [ ] |
| 6.3 | GeographicAnalysis | Fix Reimbursement Rate metric (selector exists, chart logic missing) | [ ] |
| 6.4 | All pages | Add "Data: CMS 2023" label to panel footers on data-heavy panels | [ ] |
| 6.5 | CostEstimator | Add cost distribution histogram below results table (recharts BarChart on avg payment buckets) | [ ] |
| 6.6 | ExcellenceView | Add CSV export for all 3 tables; add "Why these metrics?" expandable explainer | [ ] |

## Phase 7 — New Drug Detail Page
*`/drugs/:name` route with full 5-year trend, manufacturer breakdown, prescriber map.*

| # | Feature | Details | Status |
|---|---------|---------|--------|
| 7.1 | DrugDetail page | New `DrugDetail.jsx` at `/drugs/:name`; uses `/api/drugs/detail/:name` | [ ] |
| 7.2 | 5-year trend chart | LineChart: spending, claims, cost/unit per year (2019–2023) | [ ] |
| 7.3 | KPI row | Total spending, claims, beneficiaries, CAGR, outlier flag | [ ] |
| 7.4 | Top prescribers table | From `/api/drugs/top-prescribers` with links to clinician profiles | [ ] |
| 7.5 | Route + nav wiring | Add route in App.jsx; link from DrugSpending table rows | [ ] |

## Phase 8 — HospitalDetail Performance
*Reduce 17 parallel API calls via tab-based lazy loading.*

| # | Feature | Details | Status |
|---|---------|---------|--------|
| 8.1 | Tab-based layout | Convert sections to tabs; only load data for active tab | [ ] |
| 8.2 | Fix compare URL | Already in Phase 1; verify fix here | [ ] |
| 8.3 | Related hospitals | Add "Similar Hospitals" panel using `/api/quality/composite?state=ST&sort=star_rating` (same state + type) | [ ] |

---

## Guiding Patterns

### CSV Export (copy from SpendingValue.jsx)
```js
function exportCsv(data, filename) {
  const keys = Object.keys(data[0]);
  const csv = [keys.join(','), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}
```

### Shared Tooltip Style
```js
const TOOLTIP_STYLE = { background: '#141416', border: '1px solid #2a2a2d', borderRadius: 8, fontFamily: 'JetBrains Mono', color: '#e4e4e7', fontSize: 12 };
```

### Shared Axis Tick Style
```js
const AXIS_TICK = { fill: '#71717a', fontSize: 10, fontFamily: 'Inter, sans-serif' };
```

---

## Changelog

| Date | Phase | Notes |
|------|-------|-------|
| 2026-03-04 | Plan | Initial plan created from full audit of all 25+ pages and 172 API endpoints |
| 2026-03-04 | Phase 1 | CSV exports: PostAcuteCare (all 7 panels), HospitalExplorer (min-stars filter + export), FinancialsExplorer (leaderboard export). TransparencyScorecard tabs fixed. Quality endpoint now supports min_stars. PostAcuteCare landscape bug fixed (wrong column names). |
| 2026-03-04 | Phase 2 | DrugDetail page created at /drugs/:name — KPI row, 5-year spending bar chart, cost/unit line chart, manufacturers table, CSV export. DrugSpending rows now clickable. |
| 2026-03-04 | Phase 3 | PaymentsExplorer: real-time debounced search, YoY bar chart, CSV export on leaderboard, clear button |
| 2026-03-04 | Phase 4 | AccountabilityDashboard CSV exports (4 panels). QualityCommandCenter CSV export. |
| 2026-03-04 | Phase 5 | ClinicianDirectory: dynamic specialty list from /api/clinicians/specialties (96 real specialties); CSV export on results. |
| 2026-03-04 | Phase 6 | GeographicAnalysis: sortable state quality table, CSV export, auto-trigger ZIP search on 5-digit entry. |
| 2026-03-04 | Phase 7 | (DrugDetail — completed in Phase 2) |
| 2026-03-04 | Phase 8 | HospitalDetail: 3-tab layout reduces initial API calls from 17 to 1. Tabs: Quality & Safety, Cost & Spending, Community & Networks. |
| 2026-03-05 | Bugfixes | DataConnectors: auth headers on all fetch calls. TransparencyScorecard: null-guard on useSort hook. |
| 2026-03-05 | Phase 5 | ClinicianDirectory: 25/page Load More pagination, auth header on search. ClinicianProfile: YoY payment trend bar chart, opioid metric always shown, payments Load More (50/page). payments API: added by_year year breakdown. PhysicianAnalytics: drill-down link to clinician directory after ZIP results. |
| 2026-03-05 | Phase 4.6 | FinancialsExplorer: YoY delta indicators (▲/▼%) on all KPI cards when viewing FY2024 vs FY2023. |
| 2026-03-05 | Phase 6 | GeographicAnalysis: nearby hospitals Load More pagination (20 initial, +30 per click). Panel component: new footer prop for CMS data labels. SpendingValue: CMS 2023 data source footer on composite panel. CostEstimator: 10-bucket payment distribution histogram below results. ExcellenceView: CSV export on all 3 tables. |

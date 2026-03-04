# Cost Trends (`/trends`)

**Component:** `client/src/views/CostTrends.jsx`
**Nav group:** Cost & Financials

## Purpose
Time-series analysis of Medicare inpatient costs (2013–2023). Shows how DRG prices, charges, and Medicare payments have changed over 11 years at national, state, DRG, and hospital levels.

## Sections
1. **KPI Summary Row** — 5 cards: Avg Payment, Avg Charges, Total Discharges, Payment CAGR, Charge-to-Payment Ratio (all with YoY deltas)
2. **National Cost Trend** — ComposedChart: payment, charges, medicare lines + discharge volume bars
3. **Top Movers** — Two-column leaderboard: fastest rising and falling DRGs by 11-year CAGR (clickable → scrolls to DRG panel)
4. **DRG Cost Trend** — Line chart per DRG; compare toggle overlays two DRGs (solid vs dashed lines + comparison table)
5. **State Trend** — State summary (all-DRG) when no DRG selected; DRG-specific when both selected; includes medicare line
6. **Hospital Trend** — Per-hospital; optional DRG drill-down; compare toggle for two hospitals

## Features
- Inflation-adjusted view (CPI-U Medical Care index, Nominal / 2023$ toggle)
- CSV export button on every panel
- DRG comparison mode (DRG panel)
- Hospital comparison mode (Hospital panel)
- Hospital + DRG specific drill-down
- Trend annotations (CAGR, YoY, total % change) below each chart
- Medicare payment line on national, state, DRG, and provider charts

## Data Sources
- `GET /api/trends/national` — national all-DRG aggregate (now includes weighted_avg_medicare)
- `GET /api/trends/drg?drg=XXX` — DRG-specific national trend
- `GET /api/trends/state?state=XX&drg=XXX` — state + DRG trend (medicare now included)
- `GET /api/trends/state-summary?state=XX` — state all-DRG aggregate
- `GET /api/trends/provider?ccn=XXXXXX` — hospital all-DRG trend
- `GET /api/trends/provider-drg?ccn=XXXXXX&drg=XXX` — hospital + DRG specific trend
- `GET /api/trends/top-movers?metric=payment&limit=10&direction=desc` — DRGs ranked by CAGR

## DB Changes (Mar 4, 2026)
- `mv_state_yearly_trend` recreated with `weighted_avg_medicare` column
- New index: `idx_mih_ccn_drg_year` on `medicare_inpatient_historical`

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |
| 2026-03-04 | Major enhancement: KPI row, medicare line (national+state), state summary, hospital+DRG drill-down, DRG/hospital comparison mode, inflation toggle, CSV export, top movers leaderboard, trend annotations |

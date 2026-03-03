# Overview Page (`/overview`)

**Component:** `client/src/views/OverviewView.jsx`
**Nav group:** *(ungrouped — top of sidebar)*

## Purpose
The landing dashboard after login. Surfaces the most provocative system-wide statistics to orient users and drive them into deeper exploration.

## Sections

| Section | Description |
|---------|-------------|
| Shock Stats Hero | 4 KPI cards: national markup ratio, hospitals penalized, HAC safety failures, avg patient star rating |
| Patient Journey Cards | 4 shortcut buttons: Find a Hospital, Know Before You Go, Compare Hospitals, Accountability |
| Worst Offenders Preview | Two panels: top 5 price gougers (markup ratio), top 5 readmission penalty offenders |
| Cost vs Quality Scatter | `CostVsQualityScatter` — interactive scatter of all hospitals by cost vs composite quality score |
| Summary Cards | `SummaryCards` — DRG-filtered KPI row |
| Drilldown Map | `DrilldownMap` — choropleth by state for selected DRG + metric |
| DRG Selector | Filter control — selects DRG and metric (payment/charge/discharges) |
| Top 50 DRG Chart | `Top50DRGChart` — bar chart of top DRGs |
| Scatter Plot | `ScatterPlot` — charges vs payments scatter for selected DRG |
| ZIP Table | `ZipTable` — top 50 expensive ZIP codes for selected DRG |

## Data Sources
- `/api/drgs/top50` — DRG list + weighted averages
- `/api/quality/accountability/summary` — national markup, penalty counts, avg star
- `/api/quality/accountability/markups?limit=5` — worst 5 markups
- `/api/quality/readmissions/penalties?limit=5` — worst 5 readmission offenders

## Navigation / Drill-downs
- Shock cards → `/accountability` (markup, penalized, safety) or `/quality` (patient rating)
- Patient Journey cards → `/hospitals`, `/for-patients`, `/compare`, `/accountability`
- Worst Offenders rows → `/hospitals/:ccn`
- "See all" buttons → `/accountability`

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build — DRG explorer with map, scatter, ZIP table |
| 2026-03-02 | Added accountability summary, worst offenders panels, patient journey cards |
| 2026-03-03 | Made 4 shock KPI cards clickable (drill to `/accountability` / `/quality`) |

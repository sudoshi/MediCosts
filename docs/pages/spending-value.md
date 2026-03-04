# Spending & Value (`/spending`)

**Component:** `client/src/views/SpendingValue.jsx`
**Nav group:** Cost & Financials

## Purpose
Analyzes Medicare spending efficiency — which hospitals and regions deliver the best quality per dollar spent. Correlates CMS per-beneficiary spending scores with quality outcomes across 5,400+ hospitals.

## Sections
1. **KPI Summary Row** — 4–5 cards contextual to active tab (hospitals, avg scores, vs-national deltas)
2. **Value Composite Table** — 11-column sortable table: Stars, VBP, MSPB, Payment, PSI-90, Readmission, Mortality, HAC, Discharges. Color-coded warnings for worse-than-national metrics.
3. **VBP Rankings** — Top-20 bar chart + domain scores table (Clinical, Safety, Efficiency, Person Engagement)
4. **Spending Per Beneficiary (MSPB)** — Top-20 most efficient bar chart + full MSPB table
5. **Efficiency Frontier** — ScatterChart: cost (X) vs quality metric (Y), bubble size = discharges, star-rating colored, Pareto frontier line
6. **Correlations** — 7×7 Pearson correlation heatmap (payment, VBP, MSPB, stars, PSI-90, readmission, mortality)

## Features
- **5 tabs:** Value Composite, VBP Rankings, MSPB, Efficiency Frontier, Correlations
- **Filters:** State, Hospital Type, Ownership (Nonprofit/For-Profit/Government), Min Stars, Search (name/city/CCN)
- **KPI cards** with vs-national benchmark deltas (green = better, red = worse)
- **Color-coded table cells** — red for readmission ratio > 1.0, amber for PSI-90 > national avg
- **Efficiency Frontier scatter** — Y-axis metric selector (VBP, Stars, MSPB, PSI-90, Readmission, Mortality), quadrant labels, national reference lines
- **Pareto frontier** computation — hospitals where no other has both lower cost AND higher quality
- **Correlation matrix** — blue = positive, red = negative, computed client-side
- **CSV export** on every panel
- **Click-through** — table rows navigate to `/hospitals/:ccn`

## Data Sources
- `GET /api/value-composite?state=XX` — hospital value composite (JOINed with hospital_info for type/ownership)
- `GET /api/value-composite/summary?state=XX` — aggregate KPIs + national benchmarks
- `GET /api/vbp/rankings?state=XX&limit=500` — VBP domain scores
- `GET /api/spending/per-beneficiary?state=XX&limit=500` — MSPB scores

## DB Views
- `mv_hospital_value_composite` — 26-column materialized view (quality, cost, VBP, safety, readmissions, mortality, episode costs)
- `hospital_info` — hospital type and ownership (LEFT JOINed for filter support)

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |
| 2026-03-04 | Major enhancement: 5-tab layout (Value, VBP, MSPB, Efficiency Frontier, Correlations), KPI row with national benchmarks, enhanced 11-column value table with color-coded warnings, filters (type/ownership/stars/search), scatter plot with Y-axis selector + Pareto frontier, 7×7 correlation heatmap, CSV export on all panels, summary API endpoint |

# Hospital Financials (`/financials`)

**Component:** `client/src/views/FinancialsExplorer.jsx`
**Nav group:** Cost & Financials

## Purpose
Hospital financial statement explorer using HCRIS (Healthcare Cost Report Information System) annual cost reports. FY2023–2024 data for 11,584 hospitals.

## Features
- Search hospitals by name or state
- Financial metrics: total revenue, operating expenses, net income, operating margin
- Uncompensated care analysis (charity care + bad debt)
- Payer mix breakdown (Medicare, Medicaid, commercial, self-pay)
- Sortable leaderboards by financial metric

## Data Sources
- `/api/financials` — HCRIS cost report data
- `/api/financials/hospital/:ccn` — single hospital financial detail

## Navigation / Drill-downs
- Hospital rows → `/hospitals/:ccn`

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build — HCRIS FY2023–2024 data |

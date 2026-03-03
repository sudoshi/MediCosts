# Accountability Dashboard (`/accountability`)

**Component:** `client/src/views/AccountabilityDashboard.jsx`
**Nav group:** Quality & Safety

## Purpose
Names names. Identifies the worst-performing hospitals across three accountability dimensions: price gouging (markup ratio), readmission penalties (HRRP), and hospital-acquired condition penalties (HAC Reduction Program).

## Sections
- KPI row: total hospitals penalized, total HAC penalties, avg national markup, avg patient star
- Worst markup offenders table (charge-to-Medicare-payment ratio)
- HRRP penalty leaderboard (excess readmission ratio by condition)
- HAC penalty list (hospitals with worst patient safety records)
- State-level accountability map

## Data Sources
- `/api/quality/accountability/summary` — national penalty KPIs
- `/api/quality/accountability/markups` — markup ratio leaderboard
- `/api/quality/readmissions/penalties` — HRRP penalty data
- `/api/quality/hac` — HAC reduction program penalties

## Navigation / Drill-downs
- All hospital rows → `/hospitals/:ccn`

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build |

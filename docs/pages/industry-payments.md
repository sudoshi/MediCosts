# Industry Payments (`/payments`)

**Component:** `client/src/views/PaymentsExplorer.jsx`
**Nav group:** Cost & Financials

## Purpose
Sunshine Act (Open Payments) disclosure explorer. 30M+ financial relationships between pharmaceutical/device companies and physicians or teaching hospitals (PY2023–2024, $6.6B disclosed).

## Sections
- KPI row: total payments, total value, unique physicians, unique companies
- Top recipients leaderboard (by total value received)
- Top payers leaderboard (by total disclosed)
- Search by physician name, NPI, company, or specialty
- Payment category breakdown (research, consulting, speaker fees, royalties, etc.)

## Data Sources
- `/api/payments/summary` — aggregate KPIs
- `/api/payments/top` — top recipient/payer leaderboards
- `/api/payments/search` — full-text search
- `/api/payments/physician/:npi` — payments to a specific physician
- `/api/payments/hospital/:ccn` — payments associated with a hospital

## Navigation / Drill-downs
- Physician rows → `/clinicians/:npi`
- Hospital rows → `/hospitals/:ccn`

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build — 30M rows, dual-year (PY2023+PY2024) |
| 2026-03-03 | Fixed SQL injection in /top endpoint — numeric params now fully parameterized |

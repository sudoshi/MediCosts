# Drug Spending (`/drugs`)

**Component:** `client/src/views/DrugSpending.jsx`
**Nav group:** Cost & Financials

## Purpose
Medicare Part D drug spending explorer. Shows 5-year (2019–2023) spending trends for 14,000+ drugs and prescriber-level data for 1.38M prescribers.

## Sections
- KPI row: total 5-year spending ($551.8B), unique drugs (14K), total claims, CAGR
- Sortable drug leaderboard (6 sort modes: total spend, 2023 spend, CAGR, beneficiaries, unit cost, claims)
- Debounced search by brand or generic name
- Color-coded CAGR (red >20%, yellow >10%, green negative)
- CMS outlier flag (★) badge for high-cost drugs

## Data Sources
- `/api/drugs/summary` — portfolio KPIs
- `/api/drugs/top?sort=&limit=` — drug leaderboard
- `/api/drugs/search?q=` — brand/generic name search
- `/api/drugs/detail/:name` — single drug 5-year trend

## Navigation / Drill-downs
- Drug row → detail panel (inline expansion)
- Prescriber in ClinicianProfile → `/api/drugs/prescriber/:npi`

## Changelog

| Date | Change |
|------|--------|
| 2026-03-03 | Initial build — 14K drugs, 1.38M prescribers from CMS Part D data |

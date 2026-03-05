# Transparency Scorecard (`/transparency`)

**Component:** `client/src/views/TransparencyScorecard.jsx`
**Nav group:** Admin (topbar dropdown)
**Access:** Admin only (uses `/api/clearnetwork/*` admin routes)

## Purpose
ClearNetwork compliance dashboard — tracks which health insurers are honoring the CMS Transparency in Coverage rule by publishing accessible machine-readable files (MRFs).

## Sections
1. **KPI Row** — 5 cards: Total Insurers Tracked, Automatable, Browser/Auth Wall, Avg Transparency Score, Avg Digital Debt
2. **Scorecard Tab** — full sortable table of all scored insurers (state filter + name search)
3. **Hall of Shame Tab** — top 50 highest digital debt offenders
4. **Leaders Tab** — top 50 most transparent insurers with technical details (SSL, gzip, content-type)
5. **State Coverage Tab** — per-state insurer density with automatable/browser/dead counts

## Features
- **Score bars** — inline colored bars showing transparency (green) and digital debt (red) scores
- **Access badges** — color-coded: automatable (green), browser_required (amber), auth_required (orange), dead (red)
- **Sortable columns** — all tabs support column sorting
- **State filter** — scorecard tab filters by state
- **Search** — scorecard tab filters by insurer name
- **CSV export** — all tabs
- **MRF links** — direct link to MRF index URL where known

## Data Sources
- `GET /api/clearnetwork/latest-stats` — KPI summary (total insurers, accessibility breakdown, avg scores)
- `GET /api/clearnetwork/scorecard?state=&sort=&limit=` — full scorecard from mrf_research
- `GET /api/clearnetwork/debt-hall-of-shame` — top 50 digital debt offenders (v_digital_debt_hall_of_shame)
- `GET /api/clearnetwork/transparency-leaders` — top 50 transparent insurers (v_transparency_leaders)
- `GET /api/clearnetwork/state-coverage` — per-state summary (v_state_coverage)

## DB Views (migration 008)
- `clearnetwork.v_digital_debt_hall_of_shame` — digital_debt_score >= 50
- `clearnetwork.v_transparency_leaders` — transparency_score >= 70
- `clearnetwork.v_state_coverage` — aggregated per-state counts

## Scoring
- **transparency_score (0-100):** +30 automatable, +10 HTTP 200, +15 machine-readable content-type, +10 fast response, +5 SSL, +5 known index type
- **digital_debt_score (0-100):** +25 auth wall, +15 403/401, +30 browser-required, +40 dead/unreachable, +20 404

## Changelog

| Date | Change |
|------|--------|
| 2026-03-04 | Initial build — KPI row, 4 tabs (Scorecard, Hall of Shame, Leaders, State Coverage), score bars, access badges, CSV export |

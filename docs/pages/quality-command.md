# Quality Command Center (`/quality`)

**Component:** `client/src/views/QualityCommandCenter.jsx`
**Nav group:** Quality & Safety

## Purpose
System-wide quality analytics dashboard. Surfaces HCAHPS patient satisfaction, safety indicator scores, HAI rates, mortality rates, and CMS 5-star ratings across all hospitals.

## Sections
- National quality KPI summary (avg star, HCAHPS, mortality, readmission)
- Star rating distribution histogram
- HCAHPS domain breakdown (communication, responsiveness, environment, etc.)
- Safety indicator leaderboard (best and worst)
- Filters: state, hospital type, ownership

## Data Sources
- `/api/quality/summary` — national aggregates
- `/api/quality/hcahps` — HCAHPS domain scores
- `/api/quality/safety` — patient safety indicator data
- `/api/quality/ratings` — star rating distribution

## Navigation / Drill-downs
- Hospital rows → `/hospitals/:ccn`

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |

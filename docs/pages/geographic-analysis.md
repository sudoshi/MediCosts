# Geographic Analysis (`/geography`)

**Component:** `client/src/views/GeographicAnalysis.jsx`
**Nav group:** Geography

## Purpose
Map-first view of healthcare cost and quality disparities across states, regions, and ZIP codes. Exposes geographic inequality in access, cost, and outcomes.

## Features
- Choropleth state map (switchable metrics: avg cost, avg quality, markup ratio, shortage areas)
- ZIP-level drill-down on click
- HRSA health professional shortage area overlay
- CDC PLACES community health metrics by ZIP
- State ranking table

## Data Sources
- `/api/states/summary` — state-level cost and quality aggregates
- `/api/shortage-areas?zip=` — HRSA HPSA shortage designations
- `/api/community-health/:zip` — CDC PLACES chronic disease prevalence by ZIP

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |

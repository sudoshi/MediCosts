# Physician Analytics (`/physicians`)

**Component:** `client/src/views/PhysicianAnalytics.jsx`
**Nav group:** Providers

## Purpose
Aggregate analytics across the physician/clinician population — specialty-level cost, utilization, and payment patterns. Complements the Clinician Directory (individual lookup) with population-level views.

## Features
- Specialty-level Medicare utilization and average cost
- Top prescribers by drug spend
- Geographic distribution of specialties (shortage context)
- Sortable leaderboards

## Data Sources
- `/api/physicians/summary` — specialty aggregates
- `/api/drugs/top-prescribers` — Part D top prescribers with state/specialty filters

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |
| 2026-03-03 | Fixed blank page — SQL column aliases corrected to match frontend field names |

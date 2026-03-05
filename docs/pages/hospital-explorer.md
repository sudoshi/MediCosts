# Hospital Explorer (`/hospitals`)

**Component:** `client/src/views/HospitalExplorer.jsx`
**Nav group:** Providers

## Purpose
Search and filter all 4,000+ CMS-tracked hospitals. Primary entry point for provider-level research.

## Features
- Full-text search by name, city, state
- Filter by hospital type, ownership, star rating
- Sortable results table (cost, quality, discharges)
- Links to individual hospital detail pages

## Data Sources
- `/api/hospitals` — paginated hospital list with filters

## Navigation / Drill-downs
- Row click → `/hospitals/:ccn` (HospitalDetail)

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |
| 2026-03-04 | Added min-stars filter dropdown; added CSV export button to toolbar |

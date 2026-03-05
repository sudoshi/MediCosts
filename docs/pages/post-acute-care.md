# Post-Acute Care (`/post-acute`)

**Component:** `client/src/views/PostAcuteCare.jsx`
**Nav group:** Providers

## Purpose
Directory and analytics for the full post-acute care continuum: nursing homes, dialysis facilities, home health agencies, hospices, inpatient rehabilitation facilities (IRF), and long-term care hospitals (LTCH).

## Sections
- State-level landscape map showing facility counts by type
- Searchable/filterable facility directory across all 6 care types
- Quality rating distributions
- Links to individual facility detail pages

## Detail Pages (sub-routes, not in sidebar)
| Route | Component | Facility Type |
|-------|-----------|---------------|
| `/nursing-homes/:ccn` | NursingHomeDetail | Skilled nursing facilities |
| `/dialysis/:ccn` | DialysisDetail | ESRD dialysis centers |
| `/home-health/:ccn` | HomeHealthDetail | Home health agencies |
| `/hospice/:ccn` | HospiceDetail | Hospice providers |
| `/irf/:ccn` | RehabDetail (type=irf) | Inpatient rehab facilities |
| `/ltch/:ccn` | RehabDetail (type=ltch) | Long-term care hospitals |

## Data Sources
- `/api/post-acute/landscape` — state-level facility counts (inline UNION across 6 tables)
- `/api/post-acute/search` — cross-type facility search
- Individual facility endpoints per type

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |
| 2026-03-03 | Fixed landscape endpoint (removed broken materialized view, replaced with inline UNION query) |
| 2026-03-04 | Added CSV export button to all 7 panels (Landscape, Nursing Homes, Home Health, Hospice, Dialysis, IRF, LTCH) |
| 2026-03-04 | Fixed Landscape tab: correct column names (nursing_homes, home_health_agencies, dialysis_facilities, hospice_providers, irf_facilities, ltch_facilities); removed non-existent avg rating columns |

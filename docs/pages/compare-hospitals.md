# Compare Hospitals (`/compare`)

**Component:** `client/src/views/HospitalCompare.jsx`
**Nav group:** Quality & Safety

## Purpose
Side-by-side comparison of up to 4 hospitals across cost, quality, safety, and patient experience dimensions. Helps patients and researchers make informed choices.

## Features
- Search and add hospitals to comparison (by name or CCN)
- Side-by-side metric table: star rating, HCAHPS, mortality, readmission, markup ratio, average DRG cost
- Radar/spider chart for multi-dimensional visual comparison
- Remove / clear comparison controls

## Data Sources
- `/api/hospitals/compare?ccns=` — batch fetch comparison data for selected CCNs

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build — basic table + 5-dimension radar |
| 2026-03-04 | Major enhancement: slot-based picker (3 color-coded cards), winner summary bar, collapsible sections, 5 new data sections (HAI infections, Readmissions, Timely Care, Financials, DRG-specific cost), expanded radar to 8 dimensions, suggested comparison sets in empty state |

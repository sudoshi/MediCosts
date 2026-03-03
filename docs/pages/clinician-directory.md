# Clinician Directory (`/clinicians`)

**Component:** `client/src/views/ClinicianDirectory.jsx`
**Nav group:** Providers

## Purpose
Search 2.7M active US healthcare providers from the NPPES NPI Registry. Find any licensed clinician by name, NPI, specialty, or location.

## Features
- Search by name, NPI, specialty, city, state
- Filter by credential type (MD, DO, NP, PA, etc.)
- Paginated results table
- Links to individual clinician profiles

## Data Sources
- `/api/clinicians` — NPPES provider search with filters

## Navigation / Drill-downs
- Row click → `/clinicians/:npi` (ClinicianProfile)

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build |

# Cost Estimator (`/estimate`)

**Component:** `client/src/views/CostEstimator.jsx`
**Nav group:** Patient Tools

## Purpose
Estimates out-of-pocket cost for a procedure or DRG at specific hospitals, enriched with HRSA shortage context and CDC community health data.

## Features
- DRG / procedure search
- ZIP code input for local provider context
- Side-by-side cost estimates across nearby hospitals
- Medicare average vs hospital-specific charge comparison
- Shortage area flag (HRSA HPSA) — warns if area is underserved
- Community health risk context (CDC PLACES)

## Data Sources
- `/api/drgs/top50` — DRG reference list
- `/api/hospitals/nearby?zip=&drg=` — nearby hospitals with DRG-specific pricing
- `/api/shortage-areas?zip=` — HRSA shortage context
- `/api/community-health/:zip` — CDC community health profile

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build |

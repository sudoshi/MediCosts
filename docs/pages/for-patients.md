# For Patients — Know Before You Go (`/for-patients`)

**Component:** `client/src/views/ForPatients.jsx`
**Nav group:** Patient Tools

## Purpose
Personalized care intelligence for patients. Upload medical records or describe a condition and receive Abby-powered recommendations for the best local providers based on cost, quality, network participation, and shortage context.

## Features
- Condition/procedure input (text or structured)
- ZIP code entry for geographic context
- Abby AI analysis: recommended hospitals ranked by value score
- Insurance network check (is this provider in my plan?)
- HRSA shortage area alert (if in underserved area)
- Community health context from CDC PLACES
- Printable patient intake summary

## Data Sources
- `/api/abby/chat/stream` — SSE streaming Abby analysis
- `/api/hospitals/nearby` — hospitals near ZIP
- `/api/network/check?npi=` — insurance participation
- `/api/shortage-areas?zip=` — shortage context
- `/api/community-health/:zip` — community health profile

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build — Know Before You Go phase |

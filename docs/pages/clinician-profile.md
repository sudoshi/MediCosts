# Clinician Profile (`/clinicians/:npi`)

**Component:** `client/src/views/ClinicianProfile.jsx`
**Nav group:** Providers (reached via Clinician Directory or direct link)

## Purpose
Full profile for a single clinician identified by NPI. Aggregates provider demographics, industry payments, Part D prescribing behavior, and insurance network participation.

## Sections

| Section | Description |
|---------|-------------|
| Header | Name, credential, specialty, address, gender, NPI |
| Industry Payments | Sunshine Act disclosures from pharma/device companies (PY2023–2024) |
| Part D Prescribing | Medicare drug spending: total cost, claim count, opioid rate, avg patient age |
| Insurance Networks | ClearNetwork participation — which plans include this provider |
| Affiliated Hospitals | Hospital affiliations from NPPES/CMS data |

## Data Sources
- `/api/clinicians/:npi` — NPPES provider data
- `/api/payments/physician/:npi` — Open Payments disclosures
- `/api/drugs/prescriber/:npi` — Part D prescribing summary
- `/api/network/check?npi=` — ClearNetwork network participation

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build — provider demographics |
| 2026-03-02 | Added industry payments panel |
| 2026-03-03 | Added Part D prescribing panel, insurance network badges |
| 2026-03-05 | YoY payment trend bar chart (from new by_year field in /payments/physician/:npi); opioid metric always shown with explanatory note |

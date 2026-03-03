# Hospital Detail (`/hospitals/:ccn`)

**Component:** `client/src/views/HospitalDetail.jsx`
**Nav group:** Providers (reached via Hospital Explorer or direct link)

## Purpose
Full profile for a single hospital, identified by CMS Certification Number (CCN). Aggregates quality, cost, financial, payment disclosure, and insurance network data in one view.

## Sections

| Section | Description |
|---------|-------------|
| Header | Facility name, address, type, ownership, phone |
| Quality Composite | Star rating, HCAHPS score, safety grade, readmission rate |
| DRG Cost Breakdown | Top DRGs billed at this facility with charges vs Medicare payment |
| Industry Payments | Open Payments disclosures received by physicians affiliated here |
| Hospital Financials | HCRIS cost report data: total revenue, uncompensated care, operating margin |
| Insurance Networks | ClearNetwork participation badges (BCBS MN, BCBS IL, Kaiser, UPMC, etc.) |
| Nearby Hospitals | Map + list of comparable facilities within radius |

## Data Sources
- `/api/hospitals/:ccn` — facility info + quality composite
- `/api/drgs?ccn=` — DRG-level cost data for this facility
- `/api/payments/hospital/:ccn` — Open Payments received
- `/api/financials/hospital/:ccn` — HCRIS financial data
- `/api/network/hospital/:ccn` — ClearNetwork participation

## Navigation / Drill-downs
- Industry payment rows → `/clinicians/:npi` (ClinicianProfile)
- Nearby hospital rows → `/hospitals/:ccn`

## Changelog

| Date | Change |
|------|--------|
| 2026-02-28 | Initial build — quality + DRG cost panels |
| 2026-03-02 | Added industry payments panel, hospital financials panel |
| 2026-03-03 | Added insurance network badges via ClearNetwork |

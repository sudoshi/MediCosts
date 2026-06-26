# MediCosts Consumer Usefulness Roadmap

**Date:** 2026-06-26
**Status:** Research-backed implementation plan
**Scope:** Deep project examination plus external research on making MediCosts more useful to consumers of healthcare in the United States.
**Audience:** Product, engineering, clinical, legal/compliance, data operations.

> This plan is not medical advice, legal advice, tax advice, or insurance advice. It is an implementation roadmap for software. Any patient-facing legal, billing, debt, charity-care, No Surprises Act, ERISA, FDCPA, FCRA, state-law, tax-exempt hospital, or insurance-coverage language must be reviewed by qualified counsel before launch.

---

## 1. Executive Summary

MediCosts already has unusually strong raw assets for a consumer healthcare product: a large PostgreSQL warehouse, CMS cost and quality datasets, Open Payments, clinician and facility directories, Part D and physician spending data, HCRIS financials, HRSA shortage data, CDC community health data, ClearNetwork payer network data, an Abby AI assistant, and a partially implemented deterministic "leverage engine" for finding billing problems.

The current product, however, is still mostly an analytics workbench. It helps a motivated user inspect hospitals, clinicians, drug spending, quality, financials, and payer-network transparency. It does not yet solve the consumer's hardest jobs end to end:

1. "Where should I go for this procedure with my insurance, and what will I personally pay?"
2. "Is this bill or EOB wrong, inflated, unlawful, charity-care eligible, or worth disputing?"
3. "Which health plan best fits my doctors, drugs, expected care, and risk tolerance?"
4. "What action should I take next, and can MediCosts prepare the packet?"

The highest-leverage direction is to turn MediCosts from a transparency dashboard into a consumer action system with four integrated workflows:

1. **Before Care:** plan-aware care shopping with personalized out-of-pocket estimates, in-network validation, quality context, and uncertainty bands.
2. **After Bill:** bill/EOB upload, deterministic error detection, charity-care screening, No Surprises Act/GFE checks, evidence packets, and dispute-letter generation.
3. **Coverage Choice:** Marketplace and, later, Medicare/MA plan-fit tools using the user's providers, drugs, expected utilization, and financial risk preferences.
4. **Ongoing Watch:** alerts for provider network changes, drug-cost changes, unsafe providers/facilities, financial assistance deadlines, and collections/credit-reporting risk.

The recommended center of gravity is the existing leverage-engine direction, but with a broader consumer framing: **MediCosts should become a personal healthcare cost advocate, not just a hospital cost browser.**

---

## 2. Evidence Collected From The Repository

### 2.1 Top-level application shape

The repository is a React + Express + PostgreSQL application with a meaningful data platform behind it.

Observed files and surfaces:

- `README.md` describes MediCosts as a healthcare transparency platform with hospital cost/quality, Open Payments, Part D, HCRIS, post-acute care, NPPES, ClearNetwork, HRSA, CDC PLACES, cost estimator, and Abby.
- `client/src/App.jsx` wires 30+ protected routes including `/overview`, `/quality`, `/hospitals`, `/compare`, `/estimate`, `/for-patients`, `/payments`, `/financials`, `/drugs`, `/transparency`, `/connectors`, and `/abby`.
- `client/src/components/AppShell.jsx` groups navigation into Quality & Safety, Cost & Financials, Providers, Geography, and Patient Tools.
- `server/index.js` mounts Express routes for auth, quality, connectors, Abby, trends, post-acute, facilities, ClearNetwork admin, payments, financials, shortage areas, community health, networks, drugs, stats, and AI providers.
- `server/lib/abby-tools.js` exposes more than 50 internal data tools to Abby, including hospital search, quality, cost estimation, nearby hospitals, clinician search/profile, physician payments, shortage areas, community health, and financials.
- `crawler-files/README.md` contains a separate async scraping framework for Transparency in Coverage MRFs, hospital chargemasters, and custom endpoints.
- `clearnetwork/` contains a dedicated payer-network and MRF intelligence subsystem with registry files, crawler code, a dashboard/widget, and transparency scoring.
- `server/leverage/` contains a TypeScript deterministic judge module for bill/debt leverage findings.

### 2.2 Live database metadata

Using cheap PostgreSQL relation metadata from the configured local `.env`, the current warehouse scale is:

| Schema | Relations | Approximate rows | Total size |
|---|---:|---:|---:|
| `clearnetwork` | 18 | 95,878,920 | 21 GB |
| `medicosts` | 56 | 49,608,508 | 17 GB |
| `stage` | 272 | 117,617,776 | 32 GB |

Largest observed `medicosts` and `clearnetwork` assets by size:

| Schema | Relation | Approximate rows | Size | Consumer value |
|---|---:|---:|---:|---|
| `clearnetwork` | `network_providers` | 74,754,280 | 13 GB | In-network lookup and plan-network intelligence |
| `medicosts` | `open_payments` | 30,085,830 | 12 GB | Conflict-of-interest transparency for clinicians and teaching hospitals |
| `clearnetwork` | `canonical_providers` | 9,011,058 | 5,498 MB | Cross-payer provider identity graph |
| `medicosts` | `medicare_physician` | 9,660,647 | 2,578 MB | Physician service and utilization comparisons |
| `clearnetwork` | `plans` | 12,078,823 | 2,166 MB | Plan/network join surface |
| `medicosts` | `clinician_directory` | 2,686,173 | 724 MB | NPI/provider search |
| `medicosts` | `medicare_inpatient_historical` | 1,985,253 | 720 MB | 2013-2023 inpatient trends |
| `medicosts` | `part_d_prescribers` | 1,380,665 | 358 MB | Drug/prescriber affordability patterns |
| `medicosts` | `hospice_providers` | 465,181 | 95 MB | Post-acute consumer choice |
| `medicosts` | `hcahps_survey` | 325,652 | 91 MB | Patient experience |
| `medicosts` | `medicare_inpatient` | 146,427 | 51 MB | DRG hospital price benchmark |
| `medicosts` | `hrsa_shortage_areas` | 88,089 | 19 MB | Local access context |
| `medicosts` | `cdc_community_health` | 32,520 | 8 MB | Community health risk context |

This confirms the project is not data-starved. The missing piece is consumer workflow integration.

### 2.3 Current consumer-facing pages

The routes most directly relevant to consumers today are:

- `/estimate` (`client/src/views/CostEstimator.jsx`): DRG-based hospital estimator with ZIP/state search, sorting by payment/distance/stars/markup, shortage-area warning, and Abby handoff.
- `/for-patients` (`client/src/views/ForPatients.jsx`): local browser PDF/text extraction, condition/location/priority form, and Abby handoff. It explicitly says records stay on the user's device and nothing is stored.
- `/compare` (`client/src/views/HospitalCompare.jsx`): hospital comparison.
- `/clinicians` and `/clinicians/:npi`: clinician search/profile.
- `/payments`: Open Payments search/leaderboards.
- `/drugs` and `/drugs/:name`: Part D drug spending analytics.
- `/transparency`: ClearNetwork transparency scorecard, currently admin-only.

Important gap: these are still analytic pages. They do not produce a consumer action packet, personalized out-of-pocket calculation, stored case history, plan-fit recommendation, or dispute workflow.

### 2.4 Leverage engine status

The leverage engine is the most important current foundation for "usefulness."

Implemented:

- `server/leverage/types.ts`: claim, line item, finding, benchmark snapshot, and case score types.
- `server/leverage/judge/benchmarkProvider.ts`: benchmark provider contract.
- `server/leverage/judge/memoryBenchmarkProvider.ts`: in-memory test provider.
- `server/leverage/judge/pgBenchmarkProvider.ts`: Postgres-backed provider over `ref_*` tables.
- `server/leverage/judge/registry.ts`: stable deterministic rule registry.
- `server/leverage/judge/judgeCase.ts`: deterministic orchestrator.
- `server/leverage/judge/scoreCase.ts`: finding rollup into a 0-100 leverage score.
- Deterministic rules:
  - `OVERCHARGE_MEDICARE_MULTIPLE`
  - `NCCI_UNBUNDLING`
  - `MUE_UNIT_EXCESS`
  - `DUPLICATE_LINE`
  - `EOB_PATIENT_RESP_MISMATCH`
- `server/lib/leverage-migrate.js`: creates `lev_*` and `ref_*` tables.
- `server/lib/db-migrate.js`: calls `runLeverageMigrations()` during app startup.

Not implemented or not wired:

- No mounted `/api/cases` or `/api/leverage` route.
- No `CaseIntake`, `CaseAnalysis`, or `MyCases` frontend route.
- No persisted patient document vault.
- No server-side OCR/extraction pipeline.
- No marketplace-safe de-identified projection.
- No rule execution endpoint.
- No patient-facing report generator.
- No counsel-verified statutory rules.

### 2.5 Verification run

Commands run:

```bash
cd server && npm test
cd client && npm run build
```

Results:

- Server leverage test suite: 12 files, 37 tests, all passing.
- Client production build: succeeded.
- Build warning: Vite reports large chunks, especially `DrilldownMap` and PDF assets. This is not blocking, but it is relevant for a consumer-facing performance plan.

---

## 3. External Research Synthesis

### 3.1 Consumer pain is large and action-oriented

KFF's April 30, 2026 update reports that high healthcare cost remains a major family burden: just under half of U.S. adults say healthcare costs are difficult to afford, 36% skipped or postponed needed care due to cost in the past year, 43% did not take medication as prescribed due to cost, and 41% had health or dental debt in 2022. KFF also reports that about half of adults could not pay an unexpected $500 medical bill out of pocket without inability to pay, borrowing, or credit-card debt.
Source: https://www.kff.org/health-costs/americans-challenges-with-health-care-costs/

Peterson-KFF estimates that 20 million U.S. adults owe medical debt, most owe over $1,000, and U.S. adults owe at least $220 billion in medical debt. The burden is higher for adults with lower or modest incomes, uninsured people, rural residents, Southern residents, and people in poor health.
Source: https://www.healthsystemtracker.org/brief/the-burden-of-medical-debt-in-the-united-states/

CFPB describes medical billing as complicated and burdensome, with mistakes common and patients often struggling to correct errors. It specifically notes that multiple providers or collectors can send bills for the same visit, making total amounts hard to recognize or validate.
Source: https://www.consumerfinance.gov/archive/newsroom/cfpb-estimates-88-billion-in-medical-bills-on-credit-reports/

Implication for MediCosts: consumers need decision support and action support, not just data displays. A useful product must say: "Here is the likely cost, here is why, here is your risk, here is what to ask before care, and here is what to send after the bill."

### 3.2 Hospital price transparency is improving but still unreliable

CMS requires hospitals to publish standard charges through a comprehensive machine-readable file and a consumer-friendly list of shoppable services. CMS's technical implementation guide includes required templates, data dictionaries, CSV/JSON schemas, and implementation timelines. The current CMS GitHub guide notes that hospitals must publish all standard charges and a consumer-friendly shoppable-services list. It also notes implementation timeline changes effective January 1, 2026, with CMS enforcement beginning April 1, 2026, including new attestation and allowed-amount data elements.
Source: https://github.com/CMSgov/hospital-price-transparency

HHS OIG's 2024 audit found that 37 of 100 sampled hospitals did not comply with one or both hospital price transparency requirements, and estimated 46% of the 5,879 hospitals required to comply did not meet the rule's standard-charge availability requirements.
Source: https://oig.hhs.gov/reports/all/2024/not-all-selected-hospitals-complied-with-the-hospital-price-transparency-rule/

Implication for MediCosts: the product should ingest hospital MRFs, but it must show source provenance, confidence, freshness, and fallback logic. "Exact price" claims will be unsafe unless backed by payer/plan-specific data and benefit design.

### 3.3 Payer Transparency in Coverage files are the biggest price substrate, but they are hard to operationalize

CMS Transparency in Coverage MRF guidance requires in-network rate files and out-of-network allowed amount/billed charge files. MediCosts already has ClearNetwork and crawler foundations for this.
Source: https://github.com/CMSgov/price-transparency-guide

The current ClearNetwork system already tracks payer transparency and technical barriers. This is an asset because TiC data is public but often enormous, fragmented, difficult to parse, or hidden behind poor index patterns.

Implication for MediCosts: build a normalized price graph that connects:

- payer;
- plan/network;
- facility/provider NPI/CCN;
- CPT/HCPCS/MS-DRG/revenue/NDC codes;
- negotiated rate;
- billing class;
- service setting;
- data source and timestamp;
- confidence score.

### 3.4 The No Surprises Act creates a clear workflow but not a universal solution

CMS states that a patient-provider dispute resolution process is available to uninsured or self-pay consumers whose bill is at least $400 more than the expected charges on the good faith estimate.
Source: https://www.cms.gov/nosurprises/providers-payment-resolution-with-patients

CMS consumer materials also explain that surprise-billing protections apply to most emergency services from out-of-network providers/facilities, non-emergency services from out-of-network providers at certain in-network facilities, and out-of-network air ambulance services.
Source: https://www.cms.gov/nosurprises/consumer-advocate-toolkit

The Advanced Explanation of Benefits workflow for insured patients remains a developing area; CMS published requests and updates rather than a fully mature consumer implementation surface.
Source: https://www.cms.gov/nosurprises/policies-and-resources/overview-of-rules-fact-sheets

Implication for MediCosts: implement NSA/GFE checks as rule-gated workflows with explicit eligibility questions, document evidence, and counsel-reviewed copy. Do not overstate private rights of action or promise relief.

### 3.5 Nonprofit hospital charity-care and billing rules are directly useful

IRS Section 501(r)(4) requires tax-exempt hospital organizations to maintain written financial assistance and emergency medical care policies.
Source: https://www.irs.gov/charities-non-profits/financial-assistance-policy-and-emergency-medical-care-policy-section-501r4

IRS Section 501(r)(5) limits the amount charged to FAP-eligible individuals for emergency or medically necessary care to no more than amounts generally billed to insured individuals.
Source: https://www.irs.gov/charities-non-profits/limitation-on-charges-section-501r5

IRS Section 501(r)(6) requires reasonable efforts to determine financial-assistance eligibility before extraordinary collection actions.
Source: https://www.irs.gov/charities-non-profits/billing-and-collections-section-501r6

Implication for MediCosts: charity-care screening is one of the fastest paths to real consumer savings. It needs hospital ownership/nonprofit status, FAP policy capture, FPL/income/family-size modeling, AGB capture, and document packet generation.

### 3.6 Medical-debt credit reporting remains legally fluid

CFPB finalized a rule on January 7, 2025 to remove medical bills from credit reports, but its current archived page states that on July 11, 2025, the U.S. District Court for the Eastern District of Texas vacated the rule and that the materials are for reference only. The page was last modified June 25, 2026.
Source: https://www.consumerfinance.gov/archive/newsroom/cfpb-finalizes-rule-to-remove-medical-bills-from-credit-reports/

Implication for MediCosts: do not hardcode a federal "medical debt cannot be on credit reports" claim. Build a state-aware, date-aware, counsel-reviewed debt/collections rules engine and keep credit-reporting guidance as jurisdictional and time-versioned.

### 3.7 Payer APIs and patient data access create a future path to personalization

CMS's 2020 Interoperability and Patient Access rule requires or encourages payers to implement APIs for patient access and payer/provider/payer exchange using FHIR.
Source: https://www.cms.gov/priorities/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-patient-access-final-rule-cms-9115-f

CMS's 2024 Interoperability and Prior Authorization final rule requires impacted payers to implement certain provisions by January 1, 2026 and gives them until primarily January 1, 2027 for API requirements.
Source: https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f

CMS Blue Button is a standards-based API delivering Medicare Part A, B, and D data for over 60 million people with Medicare, and uses FHIR/OAuth patterns.
Source: https://bluebutton.cms.gov/

Implication for MediCosts: start with manual plan profiles and document uploads, then add Medicare Blue Button and payer Patient Access API integrations for users who consent. Personal data integration should be incremental because privacy, app registration, and authorization UX are non-trivial.

### 3.8 Marketplace plan data can support plan-choice workflows

CMS's Marketplace API powers HealthCare.gov Window Shop and Plan Compare. CMS states it can show plans available by location/household, provider and drug coverage, and estimated yearly costs based on expected utilization.
Source: https://developer.cms.gov/marketplace-api/

CMS Exchange Public Use Files include network, machine-readable URL, transparency in coverage, benefits/cost sharing, rates, plan attributes, service areas, crosswalk, and quality datasets. The Machine-readable URL PUF identifies issuer URL locations for machine-readable network provider and formulary information.
Source: https://www.cms.gov/marketplace/resources/data/public-use-files

Implication for MediCosts: Coverage Choice should be a first-class workflow. MediCosts already has provider networks and drug spending data; adding Marketplace API/PUF support would let consumers test "my doctors + my drugs + my likely procedures" against plan options.

### 3.9 Product landscape

Comparable consumer offerings cluster into separate categories:

- Procedure cost lookup: FAIR Health Consumer, Turquoise Health.
- Medical bill negotiation: Goodbill and similar services.
- Charity-care eligibility and applications: Dollar For.
- Plan choice: HealthCare.gov, broker/direct enrollment tools, employer benefits tools.
- Data/API infrastructure: Turquoise Health, payer MRF vendors, healthcare pricing data vendors.

MediCosts can differentiate by combining:

- plan networks;
- hospital/clinician quality;
- Open Payments conflicts;
- Medicare/Part D utilization;
- HCRIS financials;
- shortage/community health context;
- price transparency compliance;
- bill/EOB deterministic findings;
- personalized action packets.

---

## 4. Strategic Product Direction

### 4.1 Product thesis

Consumers do not need another dashboard that proves healthcare pricing is irrational. They need a trusted advocate that converts messy public and personal data into safe next actions.

The product thesis:

> MediCosts should help a consumer choose care, choose coverage, understand bills, dispute errors, and avoid preventable healthcare debt by combining public transparency data, payer network/rate data, personal documents, and deterministic rule-based reasoning.

### 4.2 North-star product

Working name: **MediCosts Consumer Advocate**

Primary workflows:

1. **Shop Care**
   - "I need a colonoscopy/knee replacement/MRI/delivery/oncology visit."
   - Enter ZIP, insurance/plan, provider preferences, urgency, and risk tolerance.
   - See in-network facilities/providers, expected out-of-pocket range, quality signals, patient experience, conflicts/payment signals, and next-call script.

2. **Check My Bill**
   - Upload bill, itemized statement, EOB, GFE, collection letter.
   - Extract codes, dates, amounts, payer decisions, patient responsibility, provider identity, facility identity, and collection status.
   - Run deterministic findings.
   - Generate a plain-language report plus dispute packets.

3. **Find Relief**
   - Screen for charity care, Medicaid/Marketplace eligibility prompts, payment plan traps, NSA/GFE dispute eligibility, state medical debt protections, and hospital FAP deadlines.
   - Generate hospital-specific FAP application checklist and cover letter.

4. **Choose Coverage**
   - Add doctors, drugs, preferred facilities, expected utilization, income/household, and risk preference.
   - Compare Marketplace plans using premiums, deductible, MOOP, provider network, drug formulary, estimated total annual cost, and worst-case risk.

5. **Ask Abby, But With Receipts**
   - Abby answers only from source-backed tools and user-consented documents.
   - Abby can prepare next actions but does not invent legal/medical conclusions.

### 4.3 What should be deprioritized

Deprioritize:

- More "hall of shame" dashboards without consumer action steps.
- Broad unsupervised legal claims before counsel review.
- A lawyer marketplace before bill-check and charity-care workflows prove demand and safety.
- Generic AI chat as the primary UX.
- Nationwide perfect MRF ingestion before high-value pilot markets.
- Exact price promises when the data only supports ranges and confidence bands.

---

## 5. Consumer Jobs To Be Done

### 5.1 Planned-care shopper

Job:

- "I need an MRI, colonoscopy, surgery, childbirth care, or specialist visit and want to avoid a financial surprise."

Required product:

- Natural language procedure search mapped to CPT/HCPCS/DRG/service bundles.
- Plan/network selection.
- Facility and professional fee separation.
- Expected out-of-pocket range.
- In-network confidence.
- Quality and complication context.
- "Call this provider/insurer and ask these exact questions" script.

Current assets:

- `/estimate` DRG search.
- `medicosts.medicare_inpatient`, `medicare_outpatient`, quality tables.
- ClearNetwork provider-network data.
- `clinician_directory`.
- Abby tools.

Gaps:

- CPT/service bundle mapping.
- Plan benefit design.
- Current deductible/OOP accumulator.
- Payer-negotiated rates at plan-provider-code level.
- Professional fees, anesthesia, labs, pathology, facility fees.

### 5.2 Person with a confusing bill

Job:

- "I got a bill and EOB. I need to know if I really owe this."

Required product:

- Bill/EOB upload.
- Itemized-line extraction.
- Patient responsibility reconciliation.
- Duplicate/unbundled/impossible-unit checks.
- Rate benchmarking.
- Network and NSA checks.
- Output: issue list, evidence table, dispute packet, call script.

Current assets:

- Browser PDF text extraction in `ForPatients.jsx`.
- `server/leverage` deterministic judge.
- `lev_*` schema migrations.
- NCCI/MUE-ready rule design.
- `EOB_PATIENT_RESP_MISMATCH`.

Gaps:

- No server route.
- No document vault.
- No OCR/LLM extraction pipeline.
- No report UI.
- No action packet generator.

### 5.3 Uninsured or self-pay patient

Job:

- "I need care or already got a bill. Can I qualify for financial assistance, cash price, GFE protections, or dispute resolution?"

Required product:

- Income/family-size/FPL screening.
- Hospital nonprofit/FAP lookup.
- Good Faith Estimate intake.
- Final bill vs GFE comparison.
- CMS PPDR packet if >= $400 over GFE and eligible.
- Clear warnings around emergency and medically necessary care.

Current assets:

- Hospital financials/HCRIS.
- Hospital info/ownership likely available or promotable.
- Leverage-engine rule catalog already planned for NSA/GFE and 501(r).

Gaps:

- Hospital FAP policy crawler and parser.
- FPL/year table.
- AGB policy capture.
- Eligibility explanation and application packets.

### 5.4 Chronic medication user

Job:

- "My drugs are expensive. Which prescribers, plans, pharmacies, or alternatives could reduce my cost?"

Required product:

- Drug list upload/entry.
- Part D/Marketplace formulary checks.
- Tier/prior authorization/step therapy flags.
- Generic/biosimilar and therapeutic alternative prompts for clinician discussion.
- Pharmacy network/preferred pharmacy comparison.

Current assets:

- Part D drug spending and prescriber data.
- Drug detail pages.
- Provider directory.

Gaps:

- User drug list.
- Formulary ingestion.
- Pharmacy network/tier data.
- No clinical substitution rules, which require careful medical-safety boundaries.

### 5.5 Coverage chooser

Job:

- "Which plan should I choose for next year?"

Required product:

- Marketplace API/PUF integration.
- Provider and facility network fit.
- Drug formulary fit.
- Premium/subsidy estimate.
- Expected utilization cost model.
- Worst-case MOOP and deductible risk.
- Plan change/crosswalk logic.

Current assets:

- ClearNetwork plan/network data.
- `docs/US_Health_Insurance_Issuers_by_Coverage_Area.xlsx`.
- CMS Marketplace API and PUFs are available externally.

Gaps:

- No current UI or schema for consumer plan comparison.
- No benefit design model.
- No subsidy/eligibility estimate.

### 5.6 Patient choosing a clinician

Job:

- "I want a physician who is in-network, experienced, not obviously conflicted, and associated with good facilities."

Required product:

- NPI search.
- In-network status.
- Affiliations.
- Open Payments summary.
- Medicare service volume, quality proxies, patient geography, and referral/facility context.
- "Confidence" explanation because public data is incomplete.

Current assets:

- `clinician_directory`.
- `open_payments`.
- `medicare_physician`.
- ClearNetwork NPI network lookup.

Gaps:

- Better consumer explanation and weighting.
- Specialty-specific experience metrics.
- Facility/pathway integration.

---

## 6. Target Architecture

### 6.1 Domain modules

Add these bounded modules without destabilizing existing analytics pages:

```text
server/
  consumer/
    profile/
    plan-fit/
    estimate/
    bill-check/
    documents/
    action-packets/
  pricing/
    hpt/
    tic/
    benchmarks/
    code-mapping/
  leverage/
    judge/              # already exists
    extract/
    narrate/
    state-rules/
  integrations/
    marketplace/
    blue-button/
    payer-access/
    tefca/              # later
client/src/views/
  ConsumerHome.jsx
  CareShop.jsx
  BillCheck.jsx
  BillReport.jsx
  MyCases.jsx
  CoverageFit.jsx
  ReliefFinder.jsx
```

### 6.2 Data model additions

Keep the current `medicosts` and `clearnetwork` schemas. Add new tables with explicit prefixes so ownership is clear.

Consumer profile:

```sql
CREATE TABLE medicosts.consumer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zip5 CHAR(5),
  state CHAR(2),
  household_size INTEGER,
  household_income_cents BIGINT,
  insurance_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Plan profile and benefit design:

```sql
CREATE TABLE medicosts.consumer_plan_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payer_name TEXT,
  plan_name TEXT,
  plan_id TEXT,
  network_id UUID,
  coverage_type TEXT,
  deductible_individual_cents BIGINT,
  deductible_family_cents BIGINT,
  deductible_remaining_cents BIGINT,
  oop_max_individual_cents BIGINT,
  oop_max_family_cents BIGINT,
  oop_remaining_cents BIGINT,
  coinsurance_pct NUMERIC(5,2),
  copay_primary_cents BIGINT,
  copay_specialist_cents BIGINT,
  source TEXT NOT NULL DEFAULT 'manual',
  effective_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Canonical price observations:

```sql
CREATE TABLE medicosts.price_observations (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL, -- hpt, tic, medicare, user_eob, cms_public
  source_url TEXT,
  source_file_hash TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE,
  payer_name TEXT,
  plan_name TEXT,
  network_id UUID,
  facility_ccn TEXT,
  provider_npi TEXT,
  billing_code_type TEXT,
  billing_code TEXT,
  modifier TEXT,
  revenue_code TEXT,
  setting TEXT,
  billing_class TEXT,
  rate_type TEXT, -- negotiated, cash, gross, medicare_allowed, allowed_amount
  amount_cents BIGINT,
  amount_min_cents BIGINT,
  amount_max_cents BIGINT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  raw_payload JSONB
);
```

Action packets:

```sql
CREATE TABLE medicosts.consumer_action_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES lev_cases(id) ON DELETE CASCADE,
  packet_type TEXT NOT NULL, -- bill_dispute, charity_care, gfe_ppdr, network_appeal
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  generated_text TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by_user BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Source snapshots:

```sql
CREATE TABLE medicosts.source_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_url TEXT,
  source_hash TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
```

### 6.3 API surface

Add consumer-specific API routes under `/api/consumer`:

```text
GET    /api/consumer/me
PATCH  /api/consumer/profile

GET    /api/consumer/procedures/search?q=
POST   /api/consumer/estimate
POST   /api/consumer/network/check
POST   /api/consumer/care-options

GET    /api/consumer/cases
POST   /api/consumer/cases
GET    /api/consumer/cases/:caseId
POST   /api/consumer/cases/:caseId/documents
POST   /api/consumer/cases/:caseId/extract
POST   /api/consumer/cases/:caseId/analyze
GET    /api/consumer/cases/:caseId/report
POST   /api/consumer/cases/:caseId/action-packets

POST   /api/consumer/coverage/marketplace/search
POST   /api/consumer/coverage/plan-fit
POST   /api/consumer/drugs/check-formulary

GET    /api/consumer/sources/:sourceId
```

Authorization:

- All case, profile, document, and action packet routes require `requireAuth`.
- Add `requireCaseOwner(caseId)`.
- Keep public read-only education and starter estimation separate from authenticated PHI workflows.
- Add higher rate limits for basic browse/search and stricter limits for OCR/LLM/extraction.

### 6.4 Frontend information architecture

Replace "Patient Tools" with a consumer-oriented workspace:

```text
My Healthcare Costs
  - Shop Care
  - Check a Bill
  - Find Relief
  - Choose Coverage
  - My Cases
```

Recommended routes:

```text
/care
/care/shop
/care/estimate/:estimateId
/bills
/bills/new
/bills/:caseId
/bills/:caseId/report
/relief
/coverage
/coverage/plan-fit
```

The existing `/estimate` and `/for-patients` should either redirect into these workflows or remain as legacy tools until replaced.

### 6.5 Abby architecture

Abby should become a constrained consumer copilot:

- It may summarize source-backed findings.
- It may draft call scripts, letters, and checklists.
- It must cite data source, date, and confidence.
- It must not create new findings beyond deterministic rules.
- It must not provide medical diagnosis, treatment selection, legal advice, or guaranteed coverage conclusions.
- It must ask for missing variables before estimating personal out-of-pocket cost.

Add tool groups:

```text
consumer_profile_tools
care_estimate_tools
bill_case_tools
charity_care_tools
coverage_fit_tools
source_citation_tools
```

---

## 7. Implementation Plan

### Phase 0: Preserve and formalize the current baseline

Goal: make sure the consumer roadmap starts from verified code and data, not stale plans.

Tasks:

- [ ] Add this roadmap to `docs/superpowers/plans/`.
- [ ] Add a short pointer from `docs/devlog.md` to this roadmap.
- [ ] Add a `docs/current-state-consumer.md` snapshot summarizing:
  - active consumer pages;
  - current database scale;
  - leverage engine status;
  - missing production workflow pieces;
  - verification commands and results.
- [ ] Add `scripts/warehouse-metadata.js` to safely emit relation sizes and approximate rows without full `COUNT(*)`.
- [ ] Add a `docs/data-source-freshness.md` page listing each public dataset, last loaded year/date, table, source URL, and refresh owner.
- [ ] Confirm whether `.firecrawl/` and `client/dist/` are intentionally ignored and keep research/build artifacts out of commits.

Exit criteria:

- Consumer-state doc exists.
- Metadata script runs without printing secrets.
- Server leverage tests pass.
- Client build passes.

### Phase 1: Consumer workspace shell

Goal: create the product frame before adding complex automation.

Tasks:

- [ ] Add `client/src/views/ConsumerHome.jsx` with four workflow entry points: Shop Care, Check a Bill, Find Relief, Choose Coverage.
- [ ] Add `client/src/views/MyCases.jsx` with empty, loading, and populated states.
- [ ] Add navigation group "My Healthcare Costs" in `AppShell.jsx`.
- [ ] Keep existing analytics pages accessible under their current groups, but make consumer tools the primary patient path.
- [ ] Add `ConsumerLayout` conventions: compact forms, source panels, uncertainty/confidence labels, next-action panels.
- [ ] Add client-side "not emergency care" and "not medical/legal advice" disclosure components.
- [ ] Add basic product telemetry events without PHI:
  - workflow_started;
  - estimate_requested;
  - document_upload_started;
  - bill_report_generated;
  - action_packet_generated.

Files likely touched:

- `client/src/App.jsx`
- `client/src/components/AppShell.jsx`
- `client/src/views/ConsumerHome.jsx`
- `client/src/views/MyCases.jsx`
- `client/src/views/*.module.css`
- `server/routes/stats.js` only if public landing stats need new consumer counts.

Exit criteria:

- Authenticated user can enter the new consumer workspace.
- Existing pages still route.
- Client build passes.

### Phase 2: Consumer profile and plan profile

Goal: collect the minimum personal variables needed for useful cost estimates without requiring payer API integration yet.

Tasks:

- [ ] Add `consumer_profiles` and `consumer_plan_profiles` migrations.
- [ ] Add `server/consumer/profile` module.
- [ ] Add profile API routes:
  - `GET /api/consumer/me`
  - `PATCH /api/consumer/profile`
  - `POST /api/consumer/plan-profile`
  - `PATCH /api/consumer/plan-profile/:id`
- [ ] Add manual plan profile form:
  - payer;
  - plan name;
  - plan type;
  - deductible;
  - remaining deductible;
  - out-of-pocket maximum;
  - remaining OOP;
  - coinsurance;
  - copays;
  - ZIP/state.
- [ ] Add "I don't know" paths that still produce non-personal estimates.
- [ ] Store all money in integer cents.
- [ ] Add Zod validation at API boundaries.

Exit criteria:

- User can save profile and plan basics.
- Profile data is never exposed to other users.
- Tests cover authorization and validation.

### Phase 3: Price graph foundation

Goal: normalize public and internal rate observations into one queryable model.

Tasks:

- [ ] Create `server/pricing/` with modules:
  - `code-mapping`;
  - `medicare-benchmarks`;
  - `hpt`;
  - `tic`;
  - `confidence`.
- [ ] Add `price_observations` and `source_snapshots` tables.
- [ ] Backfill Medicare benchmark observations from:
  - `medicosts.medicare_inpatient`;
  - `medicosts.medicare_outpatient`;
  - `medicosts.medicare_physician`;
  - `ref_cms_fee_schedule`;
  - `ref_drg_base_rate`.
- [ ] Add source provenance:
  - source type;
  - source URL;
  - fetch timestamp;
  - effective year/date;
  - code system;
  - confidence.
- [ ] Add a procedure-code search abstraction:
  - user term to DRG/CPT/HCPCS/service bundle candidates;
  - synonyms;
  - common shoppable services;
  - setting ambiguity.
- [ ] Add `GET /api/consumer/procedures/search?q=`.

Confidence model:

- `1.000`: user EOB/bill direct evidence.
- `0.900`: current payer-plan negotiated rate with matching provider/facility/code.
- `0.800`: current hospital HPT payer-specific rate with matching plan/provider/code.
- `0.700`: current Medicare allowable benchmark.
- `0.600`: state/regional Medicare or historical rate.
- `0.400`: chargemaster/gross charge only.

Exit criteria:

- One API can return benchmark observations for a code/procedure.
- Every observation has a source and confidence.
- No consumer UI claims "you will pay" without plan profile and explicit uncertainty.

### Phase 4: Estimator v2

Goal: replace the DRG-only estimator with a plan-aware estimate engine.

Tasks:

- [ ] Create `server/consumer/estimate`.
- [ ] Add `POST /api/consumer/estimate` with inputs:
  - procedure/service bundle;
  - ZIP/radius/state;
  - plan profile;
  - preferred facility/provider;
  - urgency;
  - setting;
  - deductible/OOP accumulator if known.
- [ ] Compute:
  - facility fee estimate;
  - professional fee estimate;
  - ancillary risk estimate;
  - allowed amount;
  - likely patient responsibility;
  - deductible impact;
  - coinsurance/copay impact;
  - remaining OOP max cap;
  - uncertainty range.
- [ ] Integrate ClearNetwork:
  - known in-network;
  - likely in-network;
  - unknown;
  - out-of-network;
  - stale/low-confidence.
- [ ] Add quality context:
  - CMS stars;
  - HCAHPS;
  - complications/readmissions where procedure relevant;
  - volume where available;
  - shortage area context.
- [ ] Add "what to ask before scheduling" script:
  - "Is facility NPI X in network for plan Y?"
  - "Will anesthesia/pathology/radiology be in network?"
  - "What CPT/HCPCS/DRG codes will be billed?"
  - "Can you provide a good-faith estimate or pre-service estimate?"
  - "Can you confirm my estimated patient responsibility in writing?"
- [ ] Update `/estimate` UI or create `/care/shop` and redirect.

Exit criteria:

- User can compare at least hospital-based procedures with personalized ranges.
- Results include confidence and source details.
- Abby can explain the estimate using only returned estimate facts.

### Phase 5: Bill check intake and document vault

Goal: turn the existing leverage engine into a user-visible workflow.

Tasks:

- [ ] Add `server/consumer/documents` module.
- [ ] Add `server/consumer/bill-check` module.
- [ ] Add encrypted object storage outside Postgres using existing `server/lib/crypto.js` patterns.
- [ ] Add `requireCaseOwner(caseId)` middleware.
- [ ] Add routes:
  - `GET /api/consumer/cases`
  - `POST /api/consumer/cases`
  - `GET /api/consumer/cases/:caseId`
  - `POST /api/consumer/cases/:caseId/documents`
  - `DELETE /api/consumer/cases/:caseId/documents/:documentId`
- [ ] Support document types:
  - bill;
  - itemized statement;
  - EOB;
  - Good Faith Estimate;
  - collection letter;
  - financial assistance denial;
  - insurance denial.
- [ ] Store:
  - SHA-256;
  - encrypted storage key;
  - MIME type;
  - page count;
  - upload timestamp;
  - PHI flag;
  - extraction status.
- [ ] Add retention controls:
  - user delete;
  - soft delete;
  - hard purge worker.
- [ ] Add frontend:
  - `BillCheck.jsx`;
  - `BillDocumentUpload.jsx`;
  - `BillCaseStatus.jsx`;
  - `BillReport.jsx`.

Exit criteria:

- Authenticated user can create a case and upload documents.
- User can see only their own cases.
- Documents are encrypted at rest.
- Audit log records access.

### Phase 6: Extraction pipeline

Goal: transform unstructured bills/EOBs into `ExtractedClaim` safely enough for deterministic judging.

Tasks:

- [ ] Add `server/leverage/extract/` with:
  - PDF text extraction;
  - OCR hook for scanned documents;
  - LLM structured extraction;
  - confidence scoring;
  - redaction-aware logs;
  - human-review queue seam.
- [ ] Define Zod schemas for extracted:
  - case header;
  - provider/facility identity;
  - insurance status;
  - payer/plan;
  - service dates;
  - CPT/HCPCS/revenue/MS-DRG/NDC;
  - units;
  - billed amount;
  - allowed amount;
  - plan paid;
  - patient responsibility;
  - denial/reason codes.
- [ ] Persist to existing:
  - `lev_extracted_claims`;
  - `lev_extracted_line_items`.
- [ ] Add extraction review states:
  - `needs_document`;
  - `extracting`;
  - `needs_user_review`;
  - `verified_by_user`;
  - `ready_to_analyze`.
- [ ] Never run final judge on low-confidence extraction without user confirmation.
- [ ] Add a user review UI that highlights uncertain fields.

Exit criteria:

- A fixture bill/EOB can be uploaded, extracted, reviewed, and converted into `ExtractedClaim`.
- Low-confidence fields are visible to the user.
- No PHI appears in server logs.

### Phase 7: Leverage analysis v1

Goal: expose the five existing deterministic rules to consumers.

Tasks:

- [ ] Add `POST /api/consumer/cases/:caseId/analyze`.
- [ ] Wire `PgBenchmarkProvider` to live `ref_*` and Medicare benchmark tables.
- [ ] Persist findings to `lev_findings`.
- [ ] Persist rollup to `lev_case_scores`.
- [ ] Add consumer report sections:
  - Summary;
  - "What looks wrong";
  - "Why this matters";
  - Evidence table;
  - Source/benchmark details;
  - "What to do next";
  - Limitations.
- [ ] Add source snapshot display for every benchmark.
- [ ] Add report export:
  - PDF;
  - print;
  - structured JSON for future attorney review.

Implemented rule display:

| Rule | Current engine status | Consumer explanation |
|---|---|---|
| `OVERCHARGE_MEDICARE_MULTIPLE` | Implemented | "This line is many times higher than a Medicare benchmark. This is negotiation evidence, not proof of illegality." |
| `NCCI_UNBUNDLING` | Implemented | "These codes may not be separately billable together unless a valid modifier applies." |
| `MUE_UNIT_EXCESS` | Implemented | "The billed unit count exceeds CMS medically unlikely edit limits." |
| `DUPLICATE_LINE` | Implemented | "The same or nearly same line appears more than once." |
| `EOB_PATIENT_RESP_MISMATCH` | Implemented | "The bill asks for more than the EOB says is your responsibility." |

Exit criteria:

- User can generate a report from reviewed extracted data.
- Findings are deterministic and reproducible.
- Existing 37 leverage tests still pass.
- Add integration test for case -> extract fixture -> analyze -> report.

### Phase 8: Action packets

Goal: make the output useful, not merely interesting.

Tasks:

- [ ] Add `consumer_action_packets` table.
- [ ] Add action packet generator with templates:
  - itemized bill request;
  - EOB mismatch dispute;
  - duplicate charge dispute;
  - NCCI/MUE billing error dispute;
  - request for payer reprocessing;
  - request for provider hold on collections during dispute;
  - request for financial assistance application;
  - request for written in-network estimate.
- [ ] Add evidence appendix per packet.
- [ ] Let user edit before export.
- [ ] Add delivery guidance but do not send automatically in v1.
- [ ] Track status:
  - draft;
  - downloaded;
  - sent_by_user;
  - response_received;
  - closed.

Exit criteria:

- At least three packet types can be generated from real findings.
- Packet copy is counsel-reviewed before production.
- User can download PDF and plain text.

### Phase 9: Charity-care and financial-assistance engine

Goal: capture the fastest, safest path to consumer relief for nonprofit hospital bills.

Tasks:

- [ ] Add hospital ownership/nonprofit status to hospital profile if not already promoted.
- [ ] Build FAP crawler:
  - policy URL;
  - plain-language summary;
  - application URL;
  - eligible services;
  - income thresholds;
  - asset tests;
  - residency requirements;
  - presumptive eligibility;
  - required documents;
  - deadlines;
  - AGB method if available.
- [ ] Add FPL reference table by year and household size.
- [ ] Add financial assistance screening UI:
  - household size;
  - income;
  - state;
  - bill facility;
  - insurance status.
- [ ] Add `HOSP_501R_AGB` and `ECA_BEFORE_FAP` as counsel-gated rules.
- [ ] Generate:
  - FAP checklist;
  - cover letter;
  - document list;
  - provider billing hold request.
- [ ] Add "call hospital financial assistance office" script.

Exit criteria:

- Pilot 50 hospitals across 3-5 states.
- User can determine likely FAP eligibility.
- User can produce a hospital-specific application packet.

### Phase 10: No Surprises Act and GFE workflows

Goal: safely operationalize NSA/GFE workflows where rules are clear.

Tasks:

- [ ] Add case fields:
  - emergency;
  - in-network facility;
  - out-of-network provider;
  - air ambulance;
  - uninsured/self-pay;
  - GFE received;
  - final bill amount;
  - expected charge amount;
  - consent/notice form signed.
- [ ] Add `NSA_GFE_OVERAGE` rule:
  - self-pay/uninsured;
  - GFE exists;
  - final bill at least $400 over GFE expected charges;
  - within filing window.
- [ ] Add `NSA_BALANCE_BILL_EMERGENCY` as counsel-gated and state-aware.
- [ ] Generate:
  - PPDR eligibility checklist;
  - CMS PPDR next-step guide;
  - evidence packet;
  - provider negotiation letter.
- [ ] Include explicit limitations:
  - not all surprise bills qualify;
  - advanced EOB workflows are not fully mature;
  - state laws vary;
  - counsel review required for legal claims.

Exit criteria:

- Self-pay GFE overage workflow works end to end.
- Emergency/OON workflows remain advisory until counsel approves copy and rules.

### Phase 11: Marketplace plan-fit workflow

Goal: use CMS Marketplace data and ClearNetwork to help consumers choose plans.

Tasks:

- [ ] Add CMS Marketplace API client:
  - API key management;
  - request throttling;
  - ZIP/county lookup;
  - household/income inputs;
  - plan list;
  - estimated premium/subsidy.
- [ ] Add Exchange PUF ingestion:
  - benefits/cost sharing;
  - rate;
  - plan attributes;
  - service area;
  - network;
  - machine-readable URL;
  - quality;
  - transparency in coverage.
- [ ] Add provider/drug fit:
  - user's NPIs;
  - preferred facilities;
  - medication list;
  - pharmacy preference.
- [ ] Score plans by:
  - monthly premium;
  - expected annual total cost;
  - worst-case MOOP;
  - doctor network fit;
  - drug formulary fit;
  - facility network fit;
  - quality;
  - plan stability/crosswalk.
- [ ] Add "why this plan" explanation and "tradeoffs" view.
- [ ] Do not enroll users initially; link out to HealthCare.gov or approved enrollment partner.

Exit criteria:

- User can compare Marketplace plans for one pilot state/ZIP.
- Provider and drug fit are visible.
- Plan-fit output includes caveats and source dates.

### Phase 12: Personal data integrations

Goal: reduce manual entry for users who consent.

Sequence:

1. **Blue Button sandbox**
   - Register app.
   - Implement OAuth in test environment.
   - Parse FHIR `ExplanationOfBenefit`, `Coverage`, and `Patient`.
   - Map EOB line items to leverage extraction schema.

2. **Blue Button production**
   - Complete CMS production access process.
   - Add consent UX.
   - Add revocation and data deletion.
   - Use for Medicare users only.

3. **Payer Patient Access API**
   - Build generic FHIR OAuth connector.
   - Start with one or two payer implementations.
   - Normalize adjudicated claims and prior authorization data.

4. **TEFCA Individual Access Services**
   - Defer until partner selection, identity proofing, privacy review, and contractual posture are clear.

Exit criteria:

- Medicare Blue Button sandbox can import synthetic EOBs.
- User can turn imported EOBs into bill-check cases.

### Phase 13: State-aware consumer protections

Goal: make legal/debt protections date-aware, state-aware, and counsel-reviewed.

Tasks:

- [ ] Add `state_consumer_protection_rules` table:
  - state;
  - domain;
  - effective_date;
  - sunset_date;
  - rule text summary;
  - citations;
  - counsel_status;
  - implementation_status.
- [ ] Domains:
  - surprise billing;
  - charity care;
  - billing timelines;
  - collections;
  - credit reporting;
  - interest caps;
  - wage garnishment/property liens;
  - language access.
- [ ] Add admin UI for counsel-approved rules.
- [ ] Add "state protections may apply" findings only when counsel approved.
- [ ] Do not infer legal claims from news articles alone.

Exit criteria:

- Pilot-state state-rule configuration exists.
- All statutory user-facing output references counsel-approved text and source citation.

### Phase 14: Trust, privacy, and compliance hardening

Goal: earn the right to handle sensitive patient financial and health documents.

Tasks:

- [ ] Threat model the consumer case workflow.
- [ ] Encrypt documents at rest with envelope keys.
- [ ] Add per-case audit logs:
  - upload;
  - view;
  - download;
  - analyze;
  - delete;
  - admin access.
- [ ] Add admin break-glass with reason logging.
- [ ] Add PHI redaction for logs and errors.
- [ ] Add privacy policy and consent flows specific to:
  - bill/EOB upload;
  - AI extraction;
  - data retention;
  - third-party payer API connections;
  - action packet generation.
- [ ] Add data export and deletion.
- [ ] Add session hardening:
  - short-lived access token or refresh-token split;
  - secure cookie option;
  - CSRF plan if cookie auth is adopted.
- [ ] Add security review for file uploads:
  - MIME sniffing;
  - size limits;
  - malware scanning hook;
  - PDF parsing sandbox strategy.

Exit criteria:

- Security review document exists.
- PHI-bearing flows have audit logs.
- User deletion works for cases and documents.

### Phase 15: Performance and reliability

Goal: make consumer flows fast enough for non-technical users.

Tasks:

- [ ] Code-split heavy map and PDF assets flagged by Vite build.
- [ ] Add query budgets:
  - < 300 ms p95 for autocomplete/search;
  - < 1.5 s p95 for estimate;
  - async job for extraction/analyze.
- [ ] Add job queue for:
  - extraction;
  - OCR;
  - action packet generation;
  - large MRF ingestion.
- [ ] Add progress UI and retries.
- [ ] Add cache keys that include source date and profile hash but not raw PHI.
- [ ] Add warehouse freshness checks.
- [ ] Add synthetic monitoring for:
  - login;
  - profile load;
  - estimate;
  - case creation;
  - upload;
  - report generation.

Exit criteria:

- Consumer flow does not block on large warehouse queries.
- Heavy extraction runs asynchronously.
- Frontend bundle warning is reduced or documented.

---

## 8. Pilot Strategy

### 8.1 Recommended pilot markets

Start with 3-5 states or metros where data value is high and the team can manually inspect quality:

- Pennsylvania: likely local familiarity and existing repo/test data examples.
- California: strong state consumer protections, large market, diverse providers.
- Texas: large market, legal/credit-reporting changes are especially relevant due recent federal litigation venue.
- New York or Illinois: large urban markets and consumer assistance ecosystems.
- North Carolina: notable medical-debt relief activity and policy interest.

Selection criteria:

- Strong hospital HPT availability.
- ClearNetwork payer coverage.
- Major Marketplace carrier presence.
- High hospital/clinician data coverage.
- Counsel can validate state-specific consumer rules.

### 8.2 Pilot use cases

Pilot 1: Planned MRI/colonoscopy

- Common outpatient code bundles.
- Meaningful price variation.
- Low clinical complexity.
- Good test of professional/facility fee separation.

Pilot 2: Hospital bill/EOB mismatch

- Uses implemented `EOB_PATIENT_RESP_MISMATCH`.
- Produces concrete dispute packet.
- Easier to explain and verify.

Pilot 3: Charity-care screening

- High consumer savings potential.
- Strong legal/regulatory grounding through 501(r).
- Can start with nonprofit hospitals and FAP policies.

Pilot 4: Marketplace plan fit

- User enters doctors/drugs.
- Plan fit uses CMS Marketplace API/PUFs plus ClearNetwork/formulary URLs.
- Useful during open enrollment.

---

## 9. Rule Catalog Roadmap

### 9.1 Deterministic rules already implemented

Keep these in production first:

- `OVERCHARGE_MEDICARE_MULTIPLE`
- `NCCI_UNBUNDLING`
- `MUE_UNIT_EXCESS`
- `DUPLICATE_LINE`
- `EOB_PATIENT_RESP_MISMATCH`

### 9.2 Add next non-statutory rules

- `BILL_TOTAL_MISMATCH`: sum of line items does not match stated patient balance.
- `DENIED_LINE_INCLUDED_IN_BALANCE`: denied/adjusted line still billed to patient without explanation.
- `OUT_OF_NETWORK_RATE_SPIKE`: out-of-network billed charge greatly exceeds in-network negotiated range for same provider/code if available.
- `PRICE_TRANSPARENCY_RATE_MISMATCH`: hospital's current public payer-specific rate differs materially from billed/allowed amount; output as question/evidence, not legal conclusion.
- `PROFESSIONAL_FEE_MISSING_WARNING`: facility-only estimate likely excludes anesthesia/pathology/radiology/professional components.
- `PLAN_OOP_CAP_CHECK`: patient responsibility appears to exceed known remaining OOP maximum.

### 9.3 Counsel-gated statutory or quasi-legal rules

Do not ship these as findings until counsel signs off:

- `NSA_BALANCE_BILL_EMERGENCY`
- `NSA_OON_AT_INN_FACILITY`
- `NSA_GFE_OVERAGE`
- `HOSP_501R_AGB`
- `ECA_BEFORE_FAP`
- `FDCPA_COLLECTION_NOTICE_DEFECT`
- `FCRA_MEDICAL_DEBT_REPORTING_FLAG`
- `ERISA_DENIAL_PROCEDURE_FLAG`
- State charity-care rules.
- State medical-debt collection rules.
- State credit-reporting restrictions.
- State surprise-billing protections.

### 9.4 Rule output contract

Every finding must include:

```ts
{
  ruleId: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  title: string;
  plainLanguageSummary: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  benchmarkSnapshot: object | null;
  estimatedRecoveryLowCents: number;
  estimatedRecoveryHighCents: number;
  actionOptions: string[];
  legalReviewStatus: 'not_required' | 'pending' | 'approved' | 'blocked';
}
```

---

## 10. Data Quality And Source Governance

### 10.1 Source freshness requirements

| Source | Maximum acceptable age | Action if stale |
|---|---:|---|
| Hospital HPT MRF | 30 days for active hospital price pages | show stale warning, lower confidence |
| TiC payer MRF | 30-90 days depending rule cadence and source | show stale warning, lower confidence |
| Medicare inpatient/outpatient | current CMS release | mark vintage prominently |
| CMS quality | current CMS Provider Data refresh | mark vintage prominently |
| Open Payments | current payment year release | mark payment year |
| HCRIS | current fiscal-year release | mark fiscal year |
| NPPES | monthly preferred | mark NPI last refresh |
| HRSA HPSA | monthly or API live | mark designation date |
| CDC PLACES | annual | mark model year |
| Marketplace API | live API or current plan year PUF | mark plan year |
| FAP policies | 90 days for pilot hospitals | block auto eligibility if missing/stale |

### 10.2 Confidence display rules

Never show a single number without context unless it is directly from the user's own EOB/bill.

Use:

- Exact user evidence: "$1,243 shown on your EOB."
- Public negotiated rate: "$900 public negotiated rate for this payer/plan/code, source dated YYYY-MM-DD."
- Estimated range: "$800-$1,400 estimated out-of-pocket, based on your deductible and public rate data."
- Low-confidence: "We found only gross charge/Medicare benchmark data. Treat this as a planning range, not a quote."

### 10.3 Provenance UI

Every estimate and finding should expose:

- source name;
- source URL;
- source date;
- code;
- provider/facility identifier;
- rate type;
- confidence;
- "why this may differ from your final bill."

---

## 11. UX Principles

### 11.1 Consumer-first language

Replace analytics labels with action labels:

- "Avg Payment" becomes "Typical Medicare-paid amount."
- "Markup" becomes "Charge compared with payment benchmark."
- "HCAHPS" becomes "Patient experience."
- "Open Payments" becomes "Industry payments to this clinician."
- "Digital Debt" becomes "How hard this insurer makes public data to use."

### 11.2 Required answer shape

Every core workflow should end with:

1. What we found.
2. How confident we are.
3. Why it matters.
4. What you can do next.
5. What evidence supports it.
6. What we cannot tell from the available data.

### 11.3 Avoid unsafe UX

Do not:

- rank facilities only by price;
- tell users to skip care;
- say a bill is unlawful without legal review;
- suggest medication substitutions without clinician involvement;
- imply public rates equal final patient liability;
- hide data vintage;
- bury uncertainty.

### 11.4 Accessibility and mobile

Most bill-check users will be on mobile with PDFs/photos. Requirements:

- mobile-first upload;
- camera capture path;
- large form controls;
- save-and-resume;
- short sections;
- plain-language definitions;
- printable packets;
- Spanish support in the medium term.

---

## 12. Metrics

### 12.1 Consumer outcome metrics

- Reports generated.
- Action packets generated.
- Bills with at least one high-confidence issue.
- Estimated savings identified.
- User-reported savings achieved.
- Charity-care applications generated.
- Collection holds requested.
- Plan comparisons completed.
- Users returning to update case status.

### 12.2 Data quality metrics

- Percentage of estimates with plan-specific rate match.
- Percentage of estimates with only Medicare fallback.
- HPT MRF freshness by hospital.
- TiC freshness by payer.
- Network match confidence by provider.
- Extraction confidence by document type.
- Rule false-positive rate after user review.

### 12.3 Trust and safety metrics

- PHI log incidents: target zero.
- Unauthorized case access attempts blocked.
- Document deletion SLA.
- Counsel-approved rule coverage.
- AI hallucination audit failures.
- User complaint categories.

### 12.4 Product metrics

- Estimate completion rate.
- Bill-check completion rate.
- Upload success rate.
- Time to first finding.
- Time to action packet.
- Abby handoff satisfaction.
- User retention for open cases.

---

## 13. Risk Register

| Risk | Severity | Why it matters | Mitigation |
|---|---:|---|---|
| Public rates do not equal patient cost | High | Wrong estimates can harm users | always show range/confidence/source; require plan profile for personal estimate |
| Legal advice risk | High | Statutory/debt guidance can cross UPL lines | deterministic facts, counsel-reviewed copy, no promises, attorney referral only after compliance design |
| PHI/document breach | High | User bills/EOBs are sensitive | encryption, audit logs, least privilege, deletion, upload scanning |
| MRF data quality | High | Payer/hospital files are huge and messy | provenance, confidence scoring, stale warnings, pilot markets |
| AI extraction errors | High | Wrong extraction creates wrong findings | confidence gating, user review, deterministic judge only after verified extraction |
| State law drift | High | Medical debt protections vary and change | date-aware rule table, counsel status, update cadence |
| Credit-reporting rule drift | High | CFPB rule was vacated in 2025 | do not hardcode federal protection; source/date/counsel gate |
| Performance | Medium | Large warehouse queries can be slow | precomputed views, async jobs, caching, query budgets |
| Consumer overwhelm | Medium | Too much data can paralyze users | action-first UX, progressive disclosure |
| Fee-splitting/referral concerns | High if attorney marketplace built | Legal ethics risk | attorney SaaS subscription only, no outcome/fee share, counsel review |

---

## 14. Concrete 30/60/90 Day Plan

### First 30 days

- [ ] Ship `ConsumerHome`, `MyCases`, and profile/plan profile tables.
- [ ] Add `/api/consumer` base router with auth and owner checks.
- [ ] Turn leverage judge into an internal service callable from a case.
- [ ] Build Bill Check v0:
  - create case;
  - upload document;
  - manual line item entry;
  - run deterministic rules;
  - display report.
- [ ] Add action packet v0 for EOB mismatch and duplicate line disputes.
- [ ] Add source/freshness display to current `/estimate`.
- [ ] Add warehouse metadata script and current-state doc.

### First 60 days

- [ ] Add extraction pipeline for PDFs with user review.
- [ ] Add Medicare benchmark backfill into `price_observations`.
- [ ] Add Estimator v2 backend using plan profile.
- [ ] Integrate ClearNetwork network confidence into care shopping.
- [ ] Pilot charity-care FAP crawler for 50 hospitals.
- [ ] Add FPL reference table and FAP screening UI.
- [ ] Add counsel-reviewed copy for non-legal billing-error packets.
- [ ] Add analytics on estimates, reports, packet generation, and user outcomes.

### First 90 days

- [ ] Add hospital HPT parser using CMS templates.
- [ ] Add TiC normalized rate ingestion for selected pilot payers.
- [ ] Add Marketplace API proof of concept for one pilot state.
- [ ] Add plan-fit prototype using providers, drugs, expected utilization, and cost sharing.
- [ ] Add Blue Button sandbox import proof of concept.
- [ ] Add counsel-gated NSA GFE overage workflow for self-pay users.
- [ ] Add pilot-state state-rule configuration.
- [ ] Add security review and document-retention controls.

---

## 15. Longer-Term Roadmap

### 6 months

- Public consumer care shopping for 3-5 pilot states.
- Authenticated bill-check workflow with PDF/EOB extraction and action packets.
- Charity-care screening for hundreds of hospitals.
- Marketplace plan-fit for at least one plan year and selected states.
- Blue Button sandbox and early production readiness.
- Abby constrained to source-backed consumer workflows.

### 12 months

- Expanded TiC/HPT price graph.
- State-specific medical-debt and consumer-protection rule library.
- Payer Patient Access API connectors for selected payers.
- Spanish-language workflows.
- Partner/referral workflow to consumer assistance organizations or attorneys, after compliance review.
- Outcomes dashboard showing real savings and disputes resolved.

### 18 months

- National plan-fit and bill-check coverage.
- Attorney/advocate marketplace only if legal/compliance design is complete.
- Employer/union benefits integration.
- Consumer alerts for network, drug, plan, and billing status.
- De-identified public transparency reports using aggregated findings.

---

## 16. Immediate Engineering Backlog

### Backend

- [ ] `server/routes/consumer.js` or TypeScript equivalent.
- [ ] `server/consumer/profile/`.
- [ ] `server/consumer/cases/`.
- [ ] `server/consumer/documents/`.
- [ ] `server/consumer/estimate/`.
- [ ] `server/consumer/action-packets/`.
- [ ] `server/middleware/requireCaseOwner.ts`.
- [ ] `server/lib/warehouse-metadata.js`.
- [ ] Zod schemas for consumer API inputs.
- [ ] Tests for auth, ownership, validation, and case lifecycle.

### Frontend

- [ ] `client/src/views/ConsumerHome.jsx`.
- [ ] `client/src/views/MyCases.jsx`.
- [ ] `client/src/views/BillCheck.jsx`.
- [ ] `client/src/views/BillReport.jsx`.
- [ ] `client/src/views/CareShop.jsx`.
- [ ] `client/src/views/CoverageFit.jsx`.
- [ ] `client/src/components/consumer/SourceBadge.jsx`.
- [ ] `client/src/components/consumer/ConfidenceMeter.jsx`.
- [ ] `client/src/components/consumer/ActionPacketEditor.jsx`.
- [ ] Navigation update in `AppShell.jsx`.

### Data

- [ ] `consumer_profiles`.
- [ ] `consumer_plan_profiles`.
- [ ] `price_observations`.
- [ ] `source_snapshots`.
- [ ] `consumer_action_packets`.
- [ ] `fpl_guidelines`.
- [ ] `hospital_fap_policies`.
- [ ] `state_consumer_protection_rules`.

### Tests

- [ ] Extend leverage integration tests beyond pure judge.
- [ ] Add case-owner authorization tests.
- [ ] Add document upload validation tests.
- [ ] Add estimate calculator tests with deductible/OOP scenarios.
- [ ] Add action packet snapshot tests.
- [ ] Add Playwright test for bill-check happy path.

---

## 17. Source Bibliography

Federal and public sources:

- CMS Hospital Price Transparency technical implementation guide: https://github.com/CMSgov/hospital-price-transparency
- CMS Transparency in Coverage technical guide: https://github.com/CMSgov/price-transparency-guide
- HHS OIG 2024 Hospital Price Transparency audit: https://oig.hhs.gov/reports/all/2024/not-all-selected-hospitals-complied-with-the-hospital-price-transparency-rule/
- CMS No Surprises Act provider-patient payment resolution: https://www.cms.gov/nosurprises/providers-payment-resolution-with-patients
- CMS No Surprises Act consumer advocate toolkit: https://www.cms.gov/nosurprises/consumer-advocate-toolkit
- CMS No Surprises Act rules/fact sheets: https://www.cms.gov/nosurprises/policies-and-resources/overview-of-rules-fact-sheets
- IRS Section 501(r)(4) financial assistance policy: https://www.irs.gov/charities-non-profits/financial-assistance-policy-and-emergency-medical-care-policy-section-501r4
- IRS Section 501(r)(5) limitation on charges: https://www.irs.gov/charities-non-profits/limitation-on-charges-section-501r5
- IRS Section 501(r)(6) billing and collections: https://www.irs.gov/charities-non-profits/billing-and-collections-section-501r6
- CFPB medical billing and credit-reporting report: https://www.consumerfinance.gov/archive/newsroom/cfpb-estimates-88-billion-in-medical-bills-on-credit-reports/
- CFPB archived medical-debt rule page noting July 11, 2025 vacatur: https://www.consumerfinance.gov/archive/newsroom/cfpb-finalizes-rule-to-remove-medical-bills-from-credit-reports/
- CMS Interoperability and Patient Access final rule: https://www.cms.gov/priorities/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-patient-access-final-rule-cms-9115-f
- CMS Interoperability and Prior Authorization final rule: https://www.cms.gov/initiatives/burden-reduction/overview/interoperability/policies-regulations/cms-interoperability-prior-authorization-final-rule-cms-0057-f
- CMS Blue Button API: https://bluebutton.cms.gov/
- CMS Marketplace API: https://developer.cms.gov/marketplace-api/
- CMS Exchange Public Use Files: https://www.cms.gov/marketplace/resources/data/public-use-files
- ONC TEFCA: https://healthit.gov/policy/tefca/
- ONC HTI-1 final rule: https://healthit.gov/regulations/hti-rules/hti-1-final-rule/

Consumer and market context:

- KFF Americans' Challenges with Health Care Costs, updated April 30, 2026: https://www.kff.org/health-costs/americans-challenges-with-health-care-costs/
- Peterson-KFF Health System Tracker medical debt brief: https://www.healthsystemtracker.org/brief/the-burden-of-medical-debt-in-the-united-states/
- FAIR Health Consumer: https://www.fairhealthconsumer.org/
- Turquoise Health patient price comparison: https://turquoise.health/patients
- Goodbill patients: https://www.goodbill.com/patients
- Dollar For: https://dollarfor.org/

---

## 18. Bottom Line

MediCosts can become much more useful by moving from "show me healthcare data" to "help me make and defend healthcare financial decisions."

The fastest path is:

1. Ship a real consumer case workflow around the existing leverage engine.
2. Add action packets for billing errors and EOB mismatches.
3. Add charity-care screening and hospital-specific financial assistance packets.
4. Upgrade the estimator into a plan-aware, source-cited cost range engine.
5. Add Marketplace plan-fit and Blue Button/payer API integrations after the manual workflows prove value.

The data platform is already strong. The product now needs trust, personalization, source-cited estimates, document workflows, and concrete next actions.

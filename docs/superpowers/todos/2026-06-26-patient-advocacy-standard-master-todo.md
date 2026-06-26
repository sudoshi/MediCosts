# MediCosts Patient Advocacy Standard - Master TODO

**Date:** 2026-06-26
**Status:** Master backlog for implementation planning
**Related plan:** `docs/superpowers/plans/2026-06-26-patient-advocacy-standard-implementation-plan.md`
**Related roadmap:** `docs/superpowers/plans/2026-06-26-consumer-healthcare-usefulness-roadmap.md`

## Mission

Make MediCosts the national patient-advocacy operating system for healthcare costs:

1. The most trusted consumer-facing source of truth for U.S. medical prices, quality, networks, benefits, drug costs, and billing rules.
2. A safe place for people to submit medical bills, complaints, coverage issues, and medical debt.
3. A routing hub that turns each consumer issue into evidence-backed action packets and, with consent, sends the right facts to the right helpers: hospitals, insurers, employers, regulators, nonprofit advocates, attorneys, journalists, researchers, and policy teams.
4. A public accountability layer that aggregates de-identified complaint and pricing signals without exposing patient identity or PHI.

This TODO is intentionally ambitious. Items are grouped into buildable workstreams and marked with priority:

- **P0:** Foundational; blocks safe consumer launch.
- **P1:** Core product value; needed for standard-setting usefulness.
- **P2:** Scale, differentiation, or national expansion.
- **P3:** Long-range ecosystem, marketplace, policy, or API platform.

Status values:

- `[ ]` not started
- `[~]` partially present in repo but not product-complete
- `[x]` complete

---

## 0. Program Governance And Safety

### 0.1 Product operating principles

- [ ] **P0 - Define the "consumer truth contract."**
  - Output: `docs/product/consumer-truth-contract.md`.
  - Must define what MediCosts means by exact, estimated, inferred, stale, disputed, user-submitted, regulator-confirmed, and source-backed.
  - Acceptance: every consumer cost/bill/complaint surface can point to this contract.

- [ ] **P0 - Define consumer harm constraints.**
  - Cover medical advice, legal advice, insurance advice, privacy, debt/collections, and delayed-care risk.
  - Acceptance: all workflows end with safe next-action options, not unsafe conclusions.

- [ ] **P0 - Establish counsel review lanes.**
  - Lanes: federal billing, No Surprises Act, IRS 501(r), ERISA, FDCPA/FCRA, state insurance, state medical debt, attorney marketplace/referrals, privacy.
  - Acceptance: every legal/statutory rule has `counsel_status`.

- [ ] **P0 - Create a legal-copy registry.**
  - Table or config: `copy_key`, `jurisdiction`, `effective_date`, `reviewed_by`, `reviewed_at`, `status`, `text`.
  - Acceptance: patient-facing statutory text is not hardcoded in components.

- [ ] **P0 - Define "no legal advice" and "no medical advice" UX standards.**
  - Acceptance: reusable disclosure components exist and are used in bill, complaint, debt, and estimator flows.

- [ ] **P0 - Define emergency-care escalation policy.**
  - If user indicates active emergency or urgent medical symptoms, route them away from cost tooling.
  - Acceptance: intake forms include emergency gating where relevant.

- [ ] **P0 - Establish a patient harm review board workflow.**
  - Internal weekly review of high-risk cases, complaints, AI responses, and user feedback.
  - Acceptance: issue template and review cadence documented.

### 0.2 Data governance

- [ ] **P0 - Build a source registry.**
  - Tables: `source_registry`, `source_snapshots`, `source_quality_checks`.
  - Track source owner, URL, license/terms, cadence, last fetched, last validated, expected schema, known caveats.
  - Acceptance: every price, quality, plan, rule, and complaint-routing record references a source.

- [ ] **P0 - Create a data freshness dashboard.**
  - Public for non-sensitive sources; admin detail for pipelines.
  - Acceptance: users can see when data was last updated.

- [ ] **P0 - Create confidence scoring standards.**
  - Dimensions: source authority, recency, identifier match, plan match, code match, observed vs inferred, user confirmation.
  - Acceptance: cost estimates and findings expose confidence.

- [ ] **P0 - Define data correction workflow.**
  - Users, providers, payers, and advocates can report incorrect public data.
  - Acceptance: correction reports create triage tickets and preserve original evidence.

- [ ] **P1 - Build public source changelog.**
  - Shows dataset refreshes, schema changes, parser changes, and major corrections.
  - Acceptance: changelog is generated from ingestion metadata.

### 0.3 Privacy, consent, and data rights

- [ ] **P0 - Create consent ledger.**
  - Track user consent to store documents, run AI extraction, share de-identified signals, share case with helpers, contact resolver organizations, use case for aggregate analytics.
  - Acceptance: every sharing/export action checks active consent.

- [ ] **P0 - Require a signed HIPAA authorization / medical record release before any document upload.**
  - Use the correct legal spelling: HIPAA, not HIPPA.
  - Product rule: no user can upload medical records, bills, EOBs, insurance cards, plan documents, denial letters, collection notices, or other health/payment documents until an active signed release is on file.
  - Add a versioned `con_medical_record_releases` record or equivalent consent-ledger grant before enabling upload controls.
  - The release must be reviewed by counsel and include required authorization elements: information covered, who may disclose, who may receive it, purpose, expiration date/event, signature/date, personal-representative authority when applicable, revocation rights, redisclosure warning, and any required non-conditioning language.
  - The release must distinguish user-upload authorization from third-party record-request authorization.
  - Acceptance: upload UI is blocked until signed; upload API rejects with `medical_record_release_required`; revocation blocks future uploads, third-party requests, resolver shares, and packet exports that rely on the release.

- [ ] **P0 - Build revocation and deletion paths.**
  - User can revoke sharing and request hard deletion where legally/operationally possible.
  - Acceptance: deletion covers cases, documents, extracted fields, reports, packets, and resolver access.

- [ ] **P0 - Define PHI/PII classification.**
  - Field-level tags: PHI, PII, financial, legal-sensitive, de-identified, public.
  - Acceptance: classification is used by logs, exports, API serializers, and resolver portal.

- [ ] **P0 - Create audit log service.**
  - Track read/write/export/share/admin/break-glass access.
  - Acceptance: every PHI case access emits an immutable audit event.

- [ ] **P0 - Add user data export.**
  - Export profile, cases, documents metadata, extracted fields, findings, action packets, sharing history, and audit summary.
  - Acceptance: export is generated without leaking internal secrets or other users.

- [ ] **P1 - Add privacy-preserving analytics pipeline.**
  - De-identify, bucket, and threshold public complaint/cost signals.
  - Acceptance: no public aggregate cell exposes small-count re-identification risk.

---

## 1. Current Application Foundation

### 1.1 Repo and documentation baseline

- [ ] **P0 - Add `docs/current-state-consumer.md`.**
  - Include routes, API modules, leverage-engine status, DB metadata, tests, build status, known gaps.
  - Acceptance: dated and source-linked.

- [ ] **P0 - Add `docs/product/patient-advocacy-north-star.md`.**
  - Define the future product in plain terms.
  - Acceptance: aligns with this TODO and implementation plan.

- [ ] **P0 - Add `docs/product/consumer-personas.md`.**
  - Personas: planned-care shopper, person with bill, person in collections, uninsured/self-pay patient, Medicare user, Marketplace shopper, caregiver, advocate, attorney, journalist, regulator, employer benefits team.

- [ ] **P0 - Add `docs/architecture/patient-advocacy-architecture.md`.**
  - Diagram consumer app, case service, document vault, source registry, price graph, complaint hub, resolver portal, public data portal.

- [ ] **P0 - Add `docs/security/consumer-data-threat-model.md`.**
  - Cover uploads, AI extraction, resolver sharing, public aggregates, admin access, prompt injection, malicious PDFs, broken access control.

- [ ] **P0 - Add `scripts/warehouse-metadata.js`.**
  - Safe approximate relation size/row report.
  - Acceptance: no secrets, no full scans.

### 1.2 Test and build standards

- [~] **P0 - Preserve current leverage tests.**
  - Current baseline: `server` Vitest suite passes 12 files / 37 tests.
  - Acceptance: CI or local `npm test` remains green.

- [ ] **P0 - Add integration tests for consumer cases.**
  - Case create, ownership, manual claim input, analyze, report.

- [ ] **P0 - Add API authorization tests.**
  - User cannot access another user's case, documents, packets, or resolver shares.

- [ ] **P1 - Add Playwright E2E tests.**
  - Bill check happy path.
  - Care estimate happy path.
  - Complaint submission packet path.
  - Case sharing and revocation path.

- [ ] **P1 - Add production build budget tracking.**
  - Current Vite build succeeds but warns on large map/PDF chunks.
  - Acceptance: documented budget or chunk splitting plan.

---

## 2. Consumer Workspace

### 2.1 Information architecture

- [ ] **P0 - Replace "Patient Tools" with "My Healthcare Costs."**
  - Sidebar entries:
    - Home
    - Shop Care
    - Check a Bill
    - File or Track a Complaint
    - Find Financial Relief
    - Choose Coverage
    - My Cases

- [ ] **P0 - Build `ConsumerHome`.**
  - Shows open cases, next actions, saved providers, saved plan, recent estimates, and urgent deadlines.

- [ ] **P0 - Build `MyCases`.**
  - Case list with type, status, deadline, assigned helper/resolver, last action, next step.

- [ ] **P0 - Build status taxonomy.**
  - Draft, submitted, needs documents, extracting, needs review, analyzed, packet ready, shared, response pending, resolved, closed, archived.

- [ ] **P1 - Add deadline center.**
  - GFE dispute deadlines, appeal deadlines, collection response deadlines, FAP deadlines, open enrollment deadlines.

- [ ] **P1 - Add consumer notifications.**
  - In-app first; email later.
  - Events: extraction complete, report ready, helper responded, deadline approaching, new source data affects estimate.

### 2.2 Consumer profile

- [ ] **P0 - Add consumer profile model.**
  - ZIP, state, household size, income band, insurance status, preferred language, accessibility preferences.

- [ ] **P0 - Add plan profile model.**
  - Payer, plan, network, deductible, remaining deductible, OOP max, remaining OOP, coinsurance, copays, plan year.

- [ ] **P1 - Add provider and facility preferences.**
  - Saved doctors, hospitals, pharmacies, labs.

- [ ] **P1 - Add drug list.**
  - Name, dose, frequency, NDC/RxNorm where possible, current pharmacy.

- [ ] **P2 - Add household/caregiver model.**
  - Caregiver access, dependents, proxy consent, role-limited access.

---

## 3. Universal Medical Cost Source Of Truth

### 3.1 Price graph

- [ ] **P0 - Design canonical `price_observations` table.**
  - Must support HPT, TiC, Medicare, user EOB, user bill, Marketplace benefit design, and negotiated rates.

- [ ] **P0 - Add source provenance to every price record.**
  - Source type, source URL, hash, fetched date, effective date, parser version.

- [ ] **P0 - Add confidence score to every price record.**
  - Based on source authority, recency, code match, plan match, provider/facility match.

- [ ] **P1 - Backfill Medicare benchmark price records.**
  - Inpatient DRG, outpatient, physician, fee schedule, Part D where relevant.

- [ ] **P1 - Normalize hospital HPT MRFs.**
  - Use CMS template layout.
  - Capture gross charge, cash price, payer-specific negotiated charges, min/max, estimated allowed amount, modifiers, drug unit fields, hospital location.

- [ ] **P1 - Normalize payer TiC MRFs for pilot payers.**
  - In-network negotiated rates, out-of-network allowed amounts, provider references, service codes.

- [ ] **P1 - Build service bundle model.**
  - Map consumer terms to CPT/HCPCS/MS-DRG/revenue/NDC bundles.
  - Include ancillary services and professional fees.

- [ ] **P1 - Build price conflict detection.**
  - Detect when HPT, TiC, Medicare, and user EOB disagree.
  - Do not claim illegality; surface as "needs verification."

- [ ] **P2 - Add public Cost Graph explorer.**
  - Search by procedure, facility, payer, plan, code, ZIP, state.
  - Show source confidence and rate distribution.

- [ ] **P2 - Add public API.**
  - Rate-limited, source-cited price observations and benchmarks.

### 3.2 Quality and safety graph

- [~] **P1 - Consolidate existing quality tables into a consumer quality graph.**
  - Current app has hospital quality, HCAHPS, readmissions, mortality, PSI, HAI, VBP.
  - Need consumer-friendly abstractions by procedure/service line.

- [ ] **P1 - Add quality source freshness.**
  - Display CMS release date and measure year.

- [ ] **P1 - Build "quality relevant to this procedure" logic.**
  - Not every quality metric matters for every consumer query.

- [ ] **P2 - Add avoidable harm signals.**
  - Complications, infections, readmissions, mortality, patient experience, volume, staffing where available.

### 3.3 Network and plan graph

- [~] **P1 - Productize ClearNetwork for consumers.**
  - Current ClearNetwork is partly admin/scoring oriented.
  - Need consumer "is this doctor/facility/lab/pharmacy in my plan?" workflow.

- [ ] **P1 - Add network confidence.**
  - Current, stale, exact NPI match, fuzzy name match, plan-level match, network-level match, unknown.

- [ ] **P1 - Add provider/facility plan-fit API.**
  - Input: plan, list of NPIs/CCNs, ZIP.
  - Output: in-network known/likely/unknown/out-of-network.

- [ ] **P2 - Add pharmacy/lab network support.**
  - High consumer value for hidden out-of-network costs.

- [ ] **P2 - Add Marketplace plan graph.**
  - CMS Marketplace API + Exchange PUFs.

### 3.4 Drug cost and formulary graph

- [~] **P1 - Reuse Part D drug/prescriber assets.**
  - Current app has drug spending pages and Part D prescriber data.

- [ ] **P1 - Add consumer drug list.**
  - Needed for plan-fit and affordability workflows.

- [ ] **P2 - Ingest QHP formulary machine-readable URLs.**
  - Source: CMS Exchange PUF / QHP machine-readable data.

- [ ] **P2 - Add medication affordability workflow.**
  - Show formulary status, tier, prior authorization/step therapy if available, generic/biosimilar flags.
  - Require medical-safety disclaimers and clinician discussion prompts.

---

## 4. Bill, Complaint, Issue, And Debt Intake Hub

### 4.1 Case model

- [ ] **P0 - Add unified consumer case tables.**
  - Case types:
    - bill_review
    - surprise_bill
    - good_faith_estimate_dispute
    - insurance_denial
    - prior_authorization_issue
    - charity_care
    - medical_debt
    - debt_collection
    - credit_reporting
    - privacy_access
    - provider_quality_safety
    - plan_network_access

- [ ] **P0 - Add case ownership and access policy.**
  - Owner, caregiver, internal admin, resolver, attorney, advocate, regulator export.

- [ ] **P0 - Add case timeline.**
  - Every upload, extraction, finding, packet, share, response, status change.

- [ ] **P0 - Add deadlines and reminders.**
  - User-entered and rule-derived deadlines.

- [ ] **P1 - Add multi-issue case support.**
  - One medical episode may involve provider bill, hospital bill, insurer denial, collector, and credit reporting.

### 4.2 Intake UX

- [ ] **P0 - Build guided intake triage.**
  - "What happened?"
  - "Who sent the bill or notice?"
  - "Do you have insurance?"
  - "Did this involve emergency care?"
  - "Is anyone threatening collections, lawsuit, credit reporting, wage garnishment, or denial of future care?"
  - "What outcome do you want?"

- [ ] **P0 - Build document upload.**
  - Bill, itemized bill, EOB, GFE, denial letter, prior auth, collection letter, credit report, FAP application/denial, insurance card.
  - Must require active signed HIPAA authorization / medical record release before file picker, drag/drop, camera capture, import, or upload API is available.

- [ ] **P0 - Add "manual entry if no document" path.**
  - Do not block users who have poor scans or no itemized bill.

- [ ] **P1 - Add camera/mobile capture.**
  - Multi-page, crop, rotate, readability check.

- [ ] **P1 - Add plain-language issue classification.**
  - "I was billed more than my EOB."
  - "I was out-of-network unexpectedly."
  - "The hospital is sending me to collections."
  - "My insurer denied coverage."
  - "I cannot afford this bill."

### 4.3 Document vault

- [ ] **P0 - Store documents encrypted outside Postgres.**
  - DB holds metadata, storage key, SHA-256, document type, page count, extraction status.

- [ ] **P0 - Link every stored document to the active release that allowed upload.**
  - Store `release_id`, release version, signed timestamp, signer type, and revocation state in document metadata or evidence lineage.
  - Acceptance: documents cannot be stored without a release reference; revoked releases are visible on every affected case.

- [ ] **P0 - Add malware/PDF safety scanning hook.**
  - At minimum quarantine failed MIME/sniff checks.

- [ ] **P0 - Redact logs.**
  - No document text or PHI in request/error logs.

- [ ] **P0 - Add user delete and hard purge.**
  - Include resolver access revocation.

- [ ] **P1 - Add document versioning.**
  - Preserve original, extracted text, user-corrected fields.

### 4.4 Extraction and review

- [ ] **P0 - Build structured extraction schemas.**
  - Provider, facility, payer, plan, dates, codes, units, billed, allowed, paid, patient responsibility, denial reasons, collection status.

- [ ] **P0 - Add field-level confidence.**
  - High, medium, low, missing, conflicting.

- [ ] **P0 - Require user review for low-confidence fields before final findings.**

- [ ] **P1 - Add OCR for scans/photos.**

- [ ] **P1 - Add EOB-specific parser for common formats.**

- [ ] **P1 - Add credit-report and collection-letter parser.**

- [ ] **P2 - Add payer/provider portal screenshot intake.**
  - Browser-interaction later; avoid credential storage unless needed.

---

## 5. Deterministic Advocacy Engine

### 5.1 Existing leverage rules

- [x] **P0 - Maintain `OVERCHARGE_MEDICARE_MULTIPLE`.**

- [x] **P0 - Maintain `NCCI_UNBUNDLING`.**

- [x] **P0 - Maintain `MUE_UNIT_EXCESS`.**

- [x] **P0 - Maintain `DUPLICATE_LINE`.**

- [x] **P0 - Maintain `EOB_PATIENT_RESP_MISMATCH`.**

- [ ] **P0 - Expose these rules through consumer case API.**

- [ ] **P0 - Persist findings and frozen benchmark snapshots.**

- [ ] **P0 - Build consumer report UI.**

### 5.2 Next factual billing rules

- [ ] **P1 - `BILL_TOTAL_MISMATCH`.**
  - Sum of lines does not match stated total or balance.

- [ ] **P1 - `DENIED_LINE_INCLUDED_IN_PATIENT_BALANCE`.**
  - Denied/adjusted line still included in patient bill without evidence.

- [ ] **P1 - `OOP_MAX_EXCEEDED`.**
  - Requires user plan profile and/or EOB data.

- [ ] **P1 - `NETWORK_STATUS_CONFLICT`.**
  - Provider billed out-of-network but public or plan data suggests in-network; output as verification issue.

- [ ] **P1 - `HPT_RATE_CONFLICT`.**
  - Hospital public rate materially differs from billed/allowed amount; output as evidence to ask about.

- [ ] **P1 - `TIC_RATE_CONFLICT`.**
  - Payer public negotiated rate materially differs from adjudicated allowed amount; output as evidence to ask payer about.

- [ ] **P1 - `MISSING_ITEMIZED_BILL`.**
  - Generate itemized bill request.

- [ ] **P1 - `COLLECTION_WHILE_DISPUTED`.**
  - Factual status tracking; statutory consequences counsel-gated.

### 5.3 Counsel-gated legal/statutory rules

- [ ] **P1 - `NSA_GFE_OVERAGE`.**
  - Self-pay/uninsured, GFE present, bill at least $400 over expected charges, deadline check.

- [ ] **P1 - `NSA_SURPRISE_BILL_POSSIBLE`.**
  - Emergency or OON provider at INN facility; output as possible protection and complaint path after counsel review.

- [ ] **P1 - `HOSP_501R_FAP_ELIGIBILITY_POSSIBLE`.**
  - Nonprofit hospital, income/household suggests possible eligibility.

- [ ] **P1 - `HOSP_501R_AGB_LIMIT_POSSIBLE`.**
  - FAP-eligible and amount above AGB; requires hospital policy/AGB source.

- [ ] **P1 - `ECA_BEFORE_FAP_REVIEW_POSSIBLE`.**
  - Collections/lawsuit/credit action before reasonable FAP screening.

- [ ] **P2 - `FDCPA_COLLECTION_NOTICE_FLAG`.**
  - Debt collector letter problems; counsel-gated.

- [ ] **P2 - `FCRA_MEDICAL_DEBT_REPORTING_FLAG`.**
  - Credit-report issue; state/date/counsel-gated.

- [ ] **P2 - `ERISA_DENIAL_PROCEDURE_FLAG`.**
  - Employer plan denial/appeal pathway; counsel-gated.

- [ ] **P2 - State law rules.**
  - Charity care, surprise billing, collections, credit reporting, interest, lawsuits, wage garnishment, language access.

---

## 6. Complaint Routing Hub

### 6.1 Complaint taxonomy

- [ ] **P0 - Define complaint categories.**
  - Surprise billing.
  - GFE overage.
  - Bill/EOB mismatch.
  - Insurance denial.
  - Prior authorization delay/denial.
  - Network directory inaccuracy.
  - Provider billed as out-of-network unexpectedly.
  - Charity-care denial or failure to screen.
  - Collections while disputed.
  - Medical debt credit reporting.
  - Privacy/access violation.
  - Unsafe/low-quality care billing issue.
  - Drug affordability/formulary issue.

- [ ] **P0 - Define target resolver types.**
  - Provider billing office.
  - Hospital financial assistance office.
  - Health plan.
  - Employer benefits administrator.
  - State insurance department.
  - CMS No Surprises Help Desk.
  - CFPB.
  - HHS OCR.
  - State attorney general or consumer protection office.
  - Nonprofit patient advocate.
  - Attorney/law firm.
  - Journalist/researcher/policy organization for aggregate de-identified signal.

- [ ] **P0 - Add complaint status model.**
  - Draft, packet ready, submitted by user, submitted by platform, accepted, more info requested, response received, escalated, resolved, closed.

### 6.2 Routing rules

- [ ] **P0 - Build `complaint_routing_rules`.**
  - Inputs: state, payer type, coverage type, issue type, provider type, user consent, urgency, collection status, deadline.
  - Output: recommended route(s), packet template, required evidence, submission URL/phone/fax/mail.

- [ ] **P0 - Add official complaint destinations.**
  - CMS No Surprises complaint.
  - CFPB complaint.
  - NAIC/state DOI complaint lookup.
  - HHS OCR complaint.

- [ ] **P1 - Add state-specific DOI endpoints.**
  - Start with pilot states.

- [ ] **P1 - Add employer/union benefits route.**
  - Especially for self-funded ERISA plans, but copy must be counsel-reviewed.

- [ ] **P1 - Add provider/hospital internal routes.**
  - Billing office, patient relations, financial assistance.

- [ ] **P2 - Add regulator package export.**
  - One-click packet structured for each agency but submitted by user unless platform has authority.

- [ ] **P2 - Add complaint submission API/browser automation only after legal/privacy review.**
  - Do not store external portal credentials casually.

### 6.3 Evidence packets

- [ ] **P0 - Build evidence packet schema.**
  - Case summary, issue category, chronology, parties, amounts, codes, documents, findings, sources, requested resolution.

- [ ] **P0 - Generate plain-language complaint narrative.**
  - User editable.

- [ ] **P0 - Generate resolver-specific packet.**
  - Provider, payer, regulator, advocate, attorney each need different framing.

- [ ] **P0 - Include "requested resolution."**
  - Correct bill, reprocess claim, stop collections, provide FAP application, apply FAP, refund, remove credit item, provide records, honor estimate.

- [ ] **P1 - Add response tracking.**
  - User uploads response or pastes text; platform updates case status and next steps.

---

## 7. Resolver Network And Helper Portal

### 7.1 Resolver identity and roles

- [ ] **P1 - Define resolver organization model.**
  - Nonprofit advocate, attorney/law firm, journalist, regulator contact, employer benefits team, hospital representative, payer representative, researcher.

- [ ] **P1 - Define resolver verification.**
  - Bar verification for attorneys.
  - Nonprofit verification.
  - Employer domain verification.
  - Regulator/public office verification.
  - Provider/payer domain verification.

- [ ] **P1 - Define resolver permissions.**
  - View de-identified case.
  - Request identity reveal.
  - Message user.
  - Request documents.
  - Submit proposed help plan.
  - Mark resolution outcome.

- [ ] **P1 - Build helper invitation flow.**
  - User controls who can see what.

### 7.2 De-identified case marketplace

- [ ] **P2 - Build de-identified case projection.**
  - Case type, state, debt band, issue tags, findings, evidence strength, deadlines, desired resolution.
  - Exclude identity, MRN, exact date, raw docs, full provider if re-identification risk is high.

- [ ] **P2 - Build resolver search/queue.**
  - Filters by state, issue type, amount band, urgency, rule findings, consumer consent.

- [ ] **P2 - Build "offer to help" workflow.**
  - Resolver proposes help, scope, conflicts, fee/no fee, expected next step.

- [ ] **P2 - Build identity reveal workflow.**
  - User explicitly accepts.
  - Audit log records reveal.

- [ ] **P2 - Build conflict checks.**
  - Attorney/resolver must disclose if they represent provider/payer/collector.

- [ ] **P3 - Build outcome tracking and resolver quality score.**
  - Resolution rate, response time, user satisfaction, complaint category experience.

### 7.3 Attorney and legal ethics constraints

- [ ] **P1 - Design attorney marketplace with counsel before build.**
  - No fee splitting.
  - No unauthorized practice of law.
  - No guaranteed outcomes.
  - SaaS subscriptions only if approved.
  - State-by-state referral/ad rules.

- [ ] **P2 - Add attorney onboarding.**
  - Bar number, jurisdictions, malpractice insurance, practice areas, conflicts, terms.

- [ ] **P2 - Add fee transparency.**
  - Pro bono, contingency, fee-shifting, flat fee, consultation, no platform fee share.

---

## 8. Action Packet Factory

### 8.1 Packet types

- [ ] **P0 - Itemized bill request.**

- [ ] **P0 - EOB mismatch dispute to provider.**

- [ ] **P0 - Claim reprocessing request to insurer.**

- [ ] **P0 - Duplicate charge dispute.**

- [ ] **P0 - NCCI/MUE billing-error dispute.**

- [ ] **P1 - Hold collections while disputed request.**

- [ ] **P1 - Financial assistance application request.**

- [ ] **P1 - Charity-care/FAP application cover letter.**

- [ ] **P1 - No Surprises Act complaint packet.**

- [ ] **P1 - Good Faith Estimate PPDR packet.**

- [ ] **P1 - State DOI complaint packet.**

- [ ] **P1 - CFPB debt collection/credit reporting complaint packet.**

- [ ] **P1 - HHS OCR privacy/access complaint packet.**

- [ ] **P2 - Employer benefits escalation packet.**

- [ ] **P2 - Attorney case summary packet.**

- [ ] **P2 - Media/research de-identified summary packet.**

### 8.2 Packet standards

- [ ] **P0 - Every packet must include evidence references.**

- [ ] **P0 - Every packet must include user editable narrative.**

- [ ] **P0 - Every packet must include requested resolution.**

- [ ] **P0 - Every packet must include source dates.**

- [ ] **P0 - Every packet must include "prepared by user with MediCosts assistance" language.**

- [ ] **P0 - Every statutory packet must use counsel-reviewed copy.**

- [ ] **P1 - Add packet versioning.**

- [ ] **P1 - Add delivery tracking.**

---

## 9. Financial Relief Engine

### 9.1 Charity care

- [ ] **P1 - Build hospital FAP policy registry.**
  - Policy URL, application URL, plain-language summary URL, income thresholds, asset tests, documents required, AGB method, deadline, languages.

- [ ] **P1 - Add FPL reference data.**
  - Year, household size, contiguous/AK/HI where applicable.

- [ ] **P1 - Add eligibility screener.**
  - Household size, income, state, hospital, service type, insurance status.

- [ ] **P1 - Add presumptive eligibility prompts.**
  - Medicaid, SNAP, WIC, SSI, homelessness, other indicators if hospital policy supports.

- [ ] **P1 - Add FAP packet generation.**

- [ ] **P1 - Track FAP application status.**

### 9.2 Debt relief and collections

- [ ] **P1 - Add medical debt case type.**

- [ ] **P1 - Add collector identity and notice tracking.**

- [ ] **P1 - Add dispute/validation request packet.**
  - Counsel-reviewed.

- [ ] **P1 - Add credit reporting intake.**
  - User-uploaded credit report or tradeline details.

- [ ] **P2 - Add state medical debt protection rules.**

- [ ] **P2 - Add nonprofit debt relief partner routing.**

---

## 10. Coverage Choice And Plan Advocacy

### 10.0 Plan-level outcome attribution

- [ ] **P0 - Make payer, product, plan, network, and coverage type first-class identifiers on every consumer case.**
  - Capture insurer legal name, trade name, plan name, plan ID where available, network ID, group/employer plan indicator, fully insured vs self-funded if known, Marketplace/Medicare/Medicaid/commercial category, plan year, and source of truth.
  - Acceptance: bill, complaint, denial, prior authorization, network, debt, and outcome records can be grouped by insurer and plan when the user provides or imports enough evidence.

- [ ] **P0 - Add evidence fields that distinguish "plan caused," "provider caused," "collector caused," "user-reported," and "unknown."**
  - Do not over-attribute harm when evidence is incomplete.
  - Acceptance: public and resolver reports expose attribution confidence.

- [ ] **P0 - Add outcome attribution schema.**
  - Track denied care, delayed care, out-of-network surprise, inaccurate directory, incorrect patient responsibility, unpaid/underpaid claim, collection escalation, credit reporting, FAP denial, appeal result, complaint result, bill correction, refund, debt forgiven, and user-reported health/financial consequence.
  - Acceptance: each outcome links to case, plan, payer, source documents, dates, and confidence.

- [ ] **P1 - Add payer-plan evidence packet.**
  - For users and helpers: "What you paid for," "What happened," "What plan documents/data say should have happened," "Evidence of gap," "Requested remedy."
  - Acceptance: generated packet can support insurer appeal, employer benefits escalation, state DOI complaint, CMS complaint, attorney review, or policy analysis.

- [ ] **P1 - Build plan accountability scorecards.**
  - Metrics: denial frequency, prior auth delays, network directory mismatch, out-of-network surprise patterns, complaint rate, resolution rate, average patient financial harm, medically necessary care delays, formulary/access issues, debt escalation, and outcome improvement after intervention.
  - Acceptance: public display uses only sufficiently aggregated de-identified data and includes confidence/coverage notes.

- [ ] **P1 - Add benefit promise extraction.**
  - Ingest or let users upload SBC, EOC, plan documents, insurance card, denial letters, and prior authorization criteria.
  - Acceptance: plan accountability packets can compare actual handling against plan terms and public/network/formulary data.

- [ ] **P2 - Add employer/group plan accountability layer.**
  - Where users consent and employer/group status is known, summarize issues by employer plan, TPA, PBM, carrier, network, and stop-loss/administrator if available.
  - Acceptance: no employer-facing aggregate is exposed below privacy thresholds or without appropriate consent/governance.

- [ ] **P2 - Add longitudinal plan outcome registry.**
  - Track plan-year changes, plan exits, network narrowing, premium/deductible/MOOP changes, complaint/outcome trends, and crosswalked plan IDs.
  - Acceptance: users can see whether a plan's real-world outcomes align with its advertised value over time.

### 10.1 Marketplace plan fit

- [ ] **P1 - Integrate CMS Marketplace API.**
  - Eligibility estimates, plans, out-of-pocket estimates, provider/drug coverage where available.

- [ ] **P1 - Ingest Exchange PUFs.**
  - Benefits, cost sharing, rates, plan attributes, service areas, networks, machine-readable URLs, quality, TiC.

- [ ] **P1 - Build plan-fit score.**
  - Premium, expected total cost, worst-case risk, providers, drugs, preferred facilities, plan quality, network confidence.

- [ ] **P1 - Add open enrollment UX.**
  - Deadlines, plan year, crosswalk from current plan.

- [ ] **P2 - Add direct enrollment partner handoff only after compliance review.**

### 10.2 Medicare and payer data access

- [ ] **P1 - Blue Button sandbox integration.**
  - OAuth, FHIR EOB/Coverage parsing, synthetic users.

- [ ] **P2 - Blue Button production access.**

- [ ] **P2 - Payer Patient Access API connector.**
  - Generic FHIR OAuth + payer-specific adapters.

- [ ] **P2 - Prior authorization data support.**
  - Align with CMS 2027 API requirements.

---

## 11. Public Accountability Layer

### 11.1 Public issue map

- [ ] **P2 - Build de-identified complaint heatmap.**
  - State, county/ZIP bucket, provider/payer category, issue type, amount band, status.
  - Apply small-cell suppression.

- [ ] **P2 - Build provider/payer complaint profiles.**
  - Public only after thresholds and moderation.

- [ ] **P2 - Build "cost truth score."**
  - Data availability, freshness, HPT/TiC compliance, network accuracy, complaint rate, resolution rate.

- [ ] **P2 - Build hospital financial assistance score.**
  - FAP discoverability, eligibility generosity, collection complaints, policy freshness.

- [ ] **P2 - Build payer network truth score.**
  - Directory accuracy, MRF accessibility, consumer network complaints, plan/provider mismatch signals.

### 11.2 Public reports

- [ ] **P2 - Monthly medical cost accountability report.**

- [ ] **P2 - Annual state of U.S. healthcare cost truth report.**

- [ ] **P2 - Dataset downloads for de-identified aggregate signals.**

- [ ] **P3 - Research partnership access.**
  - IRB/governance path for sensitive de-identified research.

---

## 12. Abby Patient Advocate

### 12.1 Guardrails

- [ ] **P0 - Abby cannot create findings.**
  - Only deterministic rules create findings.

- [ ] **P0 - Abby must cite sources and case evidence.**

- [ ] **P0 - Abby must refuse medical/legal conclusions.**

- [ ] **P0 - Abby must route urgent medical symptoms away from cost tooling.**

- [ ] **P0 - Abby output must be stored with prompt/version metadata when used in a case.**

### 12.2 Tools

- [ ] **P1 - Add case summary tool.**

- [ ] **P1 - Add finding explanation tool.**

- [ ] **P1 - Add action packet drafting tool.**

- [ ] **P1 - Add complaint route explanation tool.**

- [ ] **P1 - Add estimate explanation tool.**

- [ ] **P1 - Add source freshness tool.**

- [ ] **P2 - Add responder reply summarization tool.**

---

## 13. Operations

### 13.1 Case operations

- [ ] **P1 - Build internal triage dashboard.**
  - Cases needing extraction review, safety review, user support, consent issue, deadline risk.

- [ ] **P1 - Build support tooling.**
  - User-safe metadata view, no document access by default.

- [ ] **P1 - Add break-glass workflow.**
  - Requires reason; notifies/admin logs.

- [ ] **P2 - Add resolver support team workflows.**

### 13.2 Data operations

- [ ] **P0 - Add ingestion monitoring.**

- [ ] **P1 - Add source failure alerting.**

- [ ] **P1 - Add parser regression tests.**

- [ ] **P1 - Add data anomaly detection.**
  - Rate spikes, schema changes, row-count changes, source freshness failures.

### 13.3 Security operations

- [ ] **P0 - Add secret inventory.**

- [ ] **P0 - Add file upload scanning hook.**

- [ ] **P0 - Add dependency vulnerability review cadence.**

- [ ] **P1 - Add external security review before PHI launch.**

- [ ] **P1 - Add incident response plan.**

---

## 14. Success Metrics

### 14.1 Patient impact

- [ ] **P1 - Track estimated dollars identified.**

- [ ] **P1 - Track user-reported dollars saved.**

- [ ] **P1 - Track debt paused, reduced, forgiven, or corrected.**

- [ ] **P1 - Track complaints submitted and resolved.**

- [ ] **P1 - Track FAP applications generated and approved.**

- [ ] **P1 - Track bills corrected after packet generation.**

### 14.2 Trust

- [ ] **P0 - Track source coverage.**

- [ ] **P0 - Track stale data exposure.**

- [ ] **P0 - Track finding false positives and false negatives.**

- [ ] **P0 - Track unauthorized access attempts.**

- [ ] **P1 - Track user trust ratings per report.**

### 14.3 Ecosystem

- [ ] **P2 - Track verified resolver organizations.**

- [ ] **P2 - Track average time to first helper response.**

- [ ] **P2 - Track outcome quality by resolver type.**

- [ ] **P2 - Track aggregate public issue trends.**

---

## 15. First Implementation Slice

If implementation starts immediately, do this first:

1. [ ] Create consumer workspace shell.
2. [ ] Add consumer case model and owner authorization.
3. [ ] Add signed HIPAA authorization / medical record release schema, UI, and upload-gate helper.
4. [ ] Add manual bill/EOB line-item entry.
5. [ ] Wire existing leverage rules to cases.
6. [ ] Build bill report UI.
7. [ ] Generate itemized bill request and EOB mismatch dispute packets.
8. [ ] Add source/finding confidence display.
8. [ ] Add audit logging for case access.
9. [ ] Add current-state documentation and metadata script.
10. [ ] Add integration tests and Playwright happy path.

This slice creates immediate patient advocacy value without waiting for OCR, payer APIs, attorney marketplace mechanics, or nationwide MRF normalization.

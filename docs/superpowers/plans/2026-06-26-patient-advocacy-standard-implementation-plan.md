# MediCosts Patient Advocacy Standard - Implementation Plan

**Date:** 2026-06-26
**Status:** Comprehensive implementation plan
**Scope:** Make MediCosts the standard consumer patient-advocacy platform, a national source of truth for medical costs, and a case hub for complaints, issues, and medical debt.
**Related TODO:** `docs/superpowers/todos/2026-06-26-patient-advocacy-standard-master-todo.md`
**Related roadmap:** `docs/superpowers/plans/2026-06-26-consumer-healthcare-usefulness-roadmap.md`
**Related leverage spec:** `docs/superpowers/specs/2026-06-21-leverage-engine-design.md`

This is an implementation plan for software and operations. It is not medical advice, legal advice, tax advice, debt advice, or insurance advice. Patient-facing legal, billing, debt, financial-assistance, No Surprises Act, ERISA, FDCPA, FCRA, HIPAA, state-law, charity-care, and insurance-coverage language must be reviewed by qualified counsel before launch.

---

## 1. Executive Intent

MediCosts should become the consumer operating system for healthcare cost truth and patient advocacy in the United States.

The product must answer four questions better than any existing consumer tool:

1. **Before care:** where should I go, what will I personally owe, and what risks am I accepting?
2. **After care:** is this bill, EOB, denial, collection notice, or debt correct, inflated, unlawful, or worth disputing?
3. **During coverage choice:** which plan actually works for my doctors, drugs, procedures, household, and financial risk?
4. **After harm occurs:** who can help, what evidence do they need, and can MediCosts prepare the packet?

The user's additional requirement is a first-class pillar:

> MediCosts must eventually provide evidence that consumer outcomes are tied to the insurance company and plan the person was covered by, so patients can clearly show when they did not receive what they deserved and paid for.

That means the platform cannot stop at estimating prices or flagging bill errors. It must build a defensible evidence system connecting:

- The promised benefit: plan documents, summary of benefits and coverage, evidence of coverage, provider directories, formularies, quality ratings, network claims, plan marketing claims, and legal rights.
- The actual lived outcome: denial, delay, surprise bill, inaccurate network, unaffordable cost share, debt, collection escalation, credit reporting, appeal result, corrected bill, refund, charity-care award, or unresolved harm.
- The responsible or contributing actor: insurer, plan, TPA, PBM, provider, facility, collection agency, employer plan sponsor, or unknown.
- The strength of evidence: user-reported, document-backed, corroborated, regulator-confirmed, resolver-confirmed, or court/order-confirmed.

The goal is not to over-attribute blame. The goal is to make the evidence chain clear enough that consumers, advocates, regulators, employers, journalists, researchers, and policymakers can act.

---

## 2. Current Application Foundation

This plan is grounded in the current repository shape:

- The app is a React + Express + PostgreSQL system.
- `server/index.js` mounts protected API routes behind `requireAuth`.
- `client/src/App.jsx` defines protected React routes for analytics, estimate, patient tools, transparency, drugs, providers, settings, and Abby.
- `server/leverage/` already contains the deterministic leverage-engine core.
- `server/lib/leverage-migrate.js` creates `lev_*` and `ref_*` tables inside the existing `medicosts` schema.
- Existing leverage rules include overcharge-vs-Medicare benchmark, NCCI unbundling, MUE unit excess, duplicate line, and EOB patient responsibility mismatch.
- The repository already has large cost, quality, provider, Open Payments, Medicare, ClearNetwork, HRSA, CDC, HCRIS, Part D, and transparency data assets.
- The current consumer-facing flows are still mostly analytic surfaces, not stored case workflows.

The implementation strategy should therefore be additive:

1. Preserve existing analytics and leverage-engine modules.
2. Add consumer case, consent, evidence, complaint, plan, outcome, and resolver modules.
3. Mount new protected APIs under `/api/consumer`, `/api/cases`, `/api/complaints`, `/api/plans`, and `/api/resolvers`.
4. Add new React views under the existing authenticated app shell.
5. Keep deterministic findings separate from AI narrative and advice.
6. Treat AI as extraction, summarization, and drafting assistance only; never as the source of legal, billing, or plan-outcome truth.

---

## 3. Product North Star

### 3.1 One-sentence product definition

MediCosts helps people understand, prevent, dispute, route, and resolve healthcare cost harm using source-backed prices, plan-aware benefits, deterministic issue detection, and consent-based advocacy packets.

### 3.2 Consumer-facing promise

For a consumer, MediCosts should feel like:

- A cost estimator before care.
- A bill checker after care.
- A coverage assistant during enrollment.
- A medical-debt triage tool during financial stress.
- A complaint router when institutions fail.
- A private case file that preserves evidence.
- A public accountability system only after de-identification and thresholding.

### 3.3 Institutional promise

For advocates, regulators, employers, and resolver organizations, MediCosts should provide:

- Structured evidence packets.
- Verified consumer consent.
- Payer, plan, provider, facility, bill, EOB, denial, and debt facts.
- Deadlines and likely routing paths.
- Case status, notes, and response tracking.
- Aggregate signals that identify repeat harm without exposing individual patients.

### 3.4 Standard-setting bar

The product can become a standard only if it is:

- **Evidence-first:** every claim links to source records, documents, calculations, or user testimony.
- **Plan-aware:** insurance company, product, plan, network, benefit year, market, funding type, TPA, PBM, and employer context are modeled explicitly where available.
- **Consumer-actionable:** outputs become next steps, packets, letters, complaints, appeals, or shares.
- **Privacy-preserving:** PHI and financial distress never become public data.
- **Auditable:** users and operators can reconstruct why MediCosts made a finding.
- **Correctable:** users, payers, providers, and advocates can challenge data.
- **Careful about uncertainty:** the app distinguishes exact, estimated, inferred, user-reported, disputed, stale, and unknown.

---

## 4. Non-negotiable Design Principles

### 4.1 Evidence before claims

No consumer-facing accusation should be shown without an evidence record. Every finding must answer:

- What is the fact?
- Where did it come from?
- How fresh is it?
- How confident are we?
- What could make it wrong?
- What can the user do next?

### 4.2 AI cannot be the source of truth

AI may:

- Extract fields from documents.
- Summarize long records.
- Draft plain-language explanations.
- Draft complaint, appeal, and negotiation letters.
- Help classify case type.

AI must not:

- Create statutory claims without rule support.
- Invent payer obligations.
- Decide legal rights.
- Decide medical necessity.
- Decide whether a case is worth litigation.
- Publicly attribute harm to a plan without structured evidence.

### 4.3 Deterministic rules produce findings

Rules should live in versioned registries with tests. Each rule returns structured findings with:

- `rule_id`
- `rule_version`
- `severity`
- `finding_type`
- `responsible_actor_type`
- `evidence_refs`
- `benchmark_snapshot`
- `confidence`
- `counsel_status`
- `patient_safe_copy_key`

### 4.4 The app prepares options, not legal advice

The product should say:

- "This issue may be worth disputing."
- "Here is the evidence MediCosts found."
- "These are common routing options."
- "A qualified advocate or attorney should review legal claims."

The product should not say:

- "You will win."
- "This is illegal" unless counsel-approved and rule-backed.
- "You should sue."
- "Stop paying" or "ignore collections."

### 4.5 Public accountability requires de-identification

Public dashboards must use:

- Aggregation.
- Cell-size thresholds.
- Geographic bucketing where needed.
- Date bucketing.
- Debt and dollar bands.
- Redaction of names, account numbers, document text, addresses, dates of birth, MRNs, member IDs, and claim IDs.

### 4.6 Plan accountability must avoid false precision

The system must separate:

- Confirmed plan-caused outcome.
- Probable plan contribution.
- Provider-caused outcome.
- Collector-caused outcome.
- Mixed responsibility.
- Unknown.

Consumers need proof, not overconfident blame.

### 4.7 No document upload before signed HIPAA authorization

The product must require a signed HIPAA authorization / medical record release before any user can upload health, billing, insurance, or payment documents.

Implementation rules:

- Use the correct legal spelling: HIPAA, not HIPPA.
- Block file picker, drag/drop, camera capture, import, and upload API until an active signed release exists.
- Treat the release as versioned legal text with counsel status.
- Store the signature, signer type, representative authority when applicable, expiration, revocation state, and release version.
- Distinguish authorization for user-uploaded documents from authorization for MediCosts or a resolver to request records from providers, payers, plans, or other third parties.
- Link every stored document to the release that allowed the upload.
- If a release is revoked or expired, block future uploads, third-party record requests, resolver shares, and packet exports that rely on that release.

Counsel must validate the final form language before launch. At minimum, the form should account for the HIPAA authorization elements in 45 CFR 164.508: description of information, person/entity authorized to disclose, person/entity receiving the information, purpose, expiration date/event, dated signature, personal-representative authority if applicable, revocation rights, and redisclosure notice.

---

## 5. Product Pillars

### 5.1 National medical cost truth graph

Goal: unify public, negotiated, benchmark, user-observed, and plan-specific cost data.

Core features:

- Search by procedure, CPT, HCPCS, DRG, facility, clinician, drug, ZIP, state, payer, plan, and network.
- Show source-backed ranges, not fake precision.
- Preserve each observed source separately.
- Explain why user-specific out-of-pocket estimates differ from public prices.
- Compare hospital, clinician, ambulatory, drug, and facility options.

### 5.2 Consumer case hub

Goal: every consumer issue becomes a structured case.

Case types:

- Pre-care estimate.
- Bill check.
- EOB mismatch.
- Denial or prior authorization.
- Surprise bill.
- Good Faith Estimate dispute.
- Charity-care or financial assistance.
- Medical debt or collections.
- Network accuracy problem.
- Drug/formulary cost problem.
- Plan selection.
- Complaint routing.
- General advocacy request.

### 5.3 Plan-level outcome attribution

Goal: prove when outcomes are tied to insurance company, plan, product, network, and benefit design.

The platform must capture:

- Insurer legal name and trade name.
- Issuer IDs where available.
- HIOS plan IDs for Marketplace/QHP plans where available.
- CMS contract and plan IDs for Medicare Advantage and Part D where available.
- Plan name, product type, metal level, network type, market segment, state, and plan year.
- Employer/group identifiers where user consents and where safe.
- Funding type: fully insured, self-funded, government, Marketplace, Medicare Advantage, Part D, Medicaid managed care, unknown.
- TPA and PBM where visible.
- Network name and provider-directory evidence.
- Source document IDs and confidence.

It must then connect plan identity to outcomes:

- Denied service.
- Delayed care.
- Prior authorization problem.
- Incorrect cost sharing.
- Out-of-network surprise.
- Inaccurate directory.
- Claim underpayment or nonpayment.
- Unexpected debt.
- Collection escalation.
- Credit reporting.
- Appeal success or failure.
- Refund, write-off, bill correction, or charity-care award.
- User-reported inability to access care.

### 5.4 Deterministic advocacy engine

Goal: transform documents and claims into findings.

Starting foundation:

- Existing `server/leverage/` judge and rules.
- Existing `lev_*` and `ref_*` schema.

Expansion:

- Counsel-gated legal/statutory rule sets.
- State-aware rules.
- Plan-document rules.
- Network-directory rules.
- Charity-care rules.
- Debt/collection rules.
- Denial and appeal rules.
- Evidence packet rules.

### 5.5 Complaint routing hub

Goal: tell users where their issue belongs and prepare a packet.

Routing targets:

- Provider or facility billing office.
- Hospital financial assistance office.
- Insurer/member services.
- Employer benefits or plan administrator.
- State insurance department.
- CMS No Surprises complaint path.
- CFPB complaint path for debt/credit/collector issues.
- HHS OCR for privacy/HIPAA complaints.
- DOL EBSA for employer health plan claims and appeals.
- State attorney general or consumer protection agency where appropriate.
- Nonprofit advocate.
- Attorney marketplace or referral partner after counsel-approved gating.

### 5.6 Resolver network and helper portal

Goal: let people with power to help receive structured, consented cases.

Resolver types:

- Patient advocates.
- Hospital billing and financial assistance teams.
- Insurer escalation teams.
- Employer benefits teams.
- Charity-care navigators.
- Debt counselors.
- Legal aid organizations.
- Attorneys.
- Journalists and researchers for de-identified aggregate signals.
- Regulators for aggregate or complaint-specific submissions where permitted.

### 5.7 Public accountability layer

Goal: show systemic patterns without exposing patients.

Public views:

- Cost variation by procedure, facility, payer, plan, and geography.
- Plan outcome scorecards.
- Provider and facility billing issue patterns.
- Collection and medical-debt patterns.
- Surprise-billing and GFE-dispute patterns.
- Appeal and resolution patterns.
- Data freshness and source transparency.

### 5.8 Abby Patient Advocate

Goal: make Abby a case-aware guide that can explain evidence and draft packets.

Rules:

- Abby must cite case evidence and source records.
- Abby must show uncertainty.
- Abby must not invent findings.
- Abby must not submit complaints without explicit user action.
- Abby must not reveal PHI in public or cross-user contexts.

---

## 6. Target Domain Model

The existing `lev_*` tables can remain the deterministic leverage core. Add case, evidence, consent, plan, complaint, resolver, and public-aggregation tables around it.

### 6.1 Prefix strategy

Use these prefixes in the existing `medicosts` schema unless the repository later adopts a migration framework that supports namespaces cleanly:

- `lev_*`: existing leverage and deterministic findings.
- `ref_*`: reference rules and regulatory/benchmark data.
- `con_*`: consumer workspace, cases, documents, consent, events.
- `plan_*`: plan identity, benefit promises, plan documents, plan source records.
- `price_*`: normalized price observations and source snapshots.
- `comp_*`: complaint routing, packets, submissions, outcomes.
- `res_*`: resolver organizations, assignments, shares, notes.
- `pub_*`: de-identified public aggregate projections.

### 6.2 Consumer case tables

Create:

- `con_cases`
  - `id uuid primary key`
  - `user_id integer not null references users(id)`
  - `case_type text not null`
  - `status text not null`
  - `title text`
  - `state char(2)`
  - `zip3 text`
  - `service_start_date date`
  - `service_end_date date`
  - `facility_ccn text`
  - `provider_npi text`
  - `payer_id uuid`
  - `coverage_profile_id uuid`
  - `priority text`
  - `deadline_at timestamptz`
  - `created_at timestamptz`
  - `updated_at timestamptz`
  - `closed_at timestamptz`
  - `deleted_at timestamptz`

- `con_case_parties`
  - `id uuid primary key`
  - `case_id uuid`
  - `party_type text`
  - `display_name text`
  - `legal_name text`
  - `npi text`
  - `ccn text`
  - `payer_identifier text`
  - `collector_license_id text`
  - `role text`
  - `confidence numeric(4,3)`
  - `source_evidence_id uuid`

- `con_case_events`
  - `id uuid primary key`
  - `case_id uuid`
  - `event_type text`
  - `event_at timestamptz`
  - `actor_type text`
  - `actor_id text`
  - `summary text`
  - `evidence_refs jsonb`
  - `created_at timestamptz`

- `con_case_outcomes`
  - `id uuid primary key`
  - `case_id uuid`
  - `outcome_type text`
  - `outcome_status text`
  - `amount_cents bigint`
  - `harm_category text`
  - `resolved_at timestamptz`
  - `resolution_summary text`
  - `evidence_refs jsonb`
  - `created_at timestamptz`

### 6.3 Consent and privacy tables

Create:

- `con_consent_grants`
  - `id uuid primary key`
  - `user_id integer`
  - `case_id uuid`
  - `consent_type text`
  - `scope jsonb`
  - `granted_at timestamptz`
  - `expires_at timestamptz`
  - `revoked_at timestamptz`
  - `source_ip_hash text`
  - `user_agent_hash text`

- `con_medical_record_releases`
  - `id uuid primary key`
  - `user_id integer`
  - `case_id uuid`
  - `release_type text`
  - `template_version text`
  - `counsel_status text`
  - `covered_information text`
  - `authorized_disclosers jsonb`
  - `authorized_recipients jsonb`
  - `purpose text`
  - `expiration_type text`
  - `expiration_at timestamptz`
  - `expiration_event text`
  - `signer_name text`
  - `signer_type text`
  - `representative_authority text`
  - `signed_at timestamptz`
  - `revoked_at timestamptz`
  - `revocation_reason text`
  - `signature_artifact_key text`
  - `source_ip_hash text`
  - `user_agent_hash text`

- `con_audit_events`
  - `id bigserial primary key`
  - `user_id integer`
  - `case_id uuid`
  - `actor_user_id integer`
  - `actor_org_id uuid`
  - `event_type text`
  - `resource_type text`
  - `resource_id text`
  - `decision text`
  - `reason text`
  - `created_at timestamptz`

- `con_data_subject_requests`
  - `id uuid primary key`
  - `user_id integer`
  - `request_type text`
  - `status text`
  - `requested_at timestamptz`
  - `completed_at timestamptz`
  - `export_key text`

### 6.4 Document and evidence tables

Create:

- `con_documents`
  - `id uuid primary key`
  - `case_id uuid`
  - `user_id integer`
  - `document_type text`
  - `storage_key text`
  - `sha256 text`
  - `file_size_bytes bigint`
  - `mime_type text`
  - `medical_record_release_id uuid`
  - `page_count integer`
  - `phi_present boolean`
  - `pii_present boolean`
  - `malware_scan_status text`
  - `ocr_status text`
  - `extraction_status text`
  - `created_at timestamptz`
  - `deleted_at timestamptz`

- `con_evidence_items`
  - `id uuid primary key`
  - `case_id uuid`
  - `document_id uuid`
  - `evidence_type text`
  - `field_name text`
  - `field_value text`
  - `normalized_value jsonb`
  - `page_number integer`
  - `bbox jsonb`
  - `confidence numeric(4,3)`
  - `extraction_method text`
  - `review_status text`
  - `created_at timestamptz`

### 6.5 Plan identity and benefit promise tables

Create:

- `plan_coverage_profiles`
  - `id uuid primary key`
  - `user_id integer`
  - `coverage_type text`
  - `market_segment text`
  - `funding_type text`
  - `state char(2)`
  - `plan_year integer`
  - `payer_legal_name text`
  - `payer_trade_name text`
  - `issuer_hios_id text`
  - `hios_plan_id text`
  - `cms_contract_id text`
  - `cms_plan_id text`
  - `plan_name text`
  - `product_type text`
  - `metal_level text`
  - `network_type text`
  - `network_name text`
  - `group_number_hash text`
  - `member_id_hash text`
  - `employer_name_hash text`
  - `tpa_name text`
  - `pbm_name text`
  - `source_document_id uuid`
  - `identity_confidence numeric(4,3)`
  - `created_at timestamptz`
  - `updated_at timestamptz`

- `plan_source_records`
  - `id uuid primary key`
  - `source_registry_id uuid`
  - `source_record_key text`
  - `plan_year integer`
  - `state char(2)`
  - `issuer_id text`
  - `plan_id text`
  - `raw jsonb`
  - `normalized jsonb`
  - `fetched_at timestamptz`

- `plan_benefit_promises`
  - `id uuid primary key`
  - `coverage_profile_id uuid`
  - `promise_type text`
  - `service_code text`
  - `service_label text`
  - `network_scope text`
  - `cost_share_type text`
  - `cost_share_value text`
  - `requires_prior_auth boolean`
  - `requires_referral boolean`
  - `limit_text text`
  - `source_evidence_id uuid`
  - `confidence numeric(4,3)`
  - `created_at timestamptz`

- `plan_network_evidence`
  - `id uuid primary key`
  - `coverage_profile_id uuid`
  - `provider_npi text`
  - `facility_ccn text`
  - `network_status text`
  - `source_type text`
  - `source_url text`
  - `observed_at timestamptz`
  - `source_evidence_id uuid`
  - `confidence numeric(4,3)`

### 6.6 Outcome attribution tables

Create:

- `plan_outcome_attributions`
  - `id uuid primary key`
  - `case_id uuid`
  - `case_outcome_id uuid`
  - `coverage_profile_id uuid`
  - `attributed_actor_type text`
  - `attributed_actor_name text`
  - `payer_legal_name text`
  - `payer_trade_name text`
  - `plan_identifier text`
  - `plan_year integer`
  - `network_name text`
  - `attribution_type text`
  - `attribution_confidence numeric(4,3)`
  - `attribution_basis text`
  - `evidence_refs jsonb`
  - `review_status text`
  - `created_at timestamptz`

Allowed `attribution_type` values:

- `plan_caused`
- `plan_contributed`
- `payer_caused`
- `provider_caused`
- `collector_caused`
- `employer_plan_admin_caused`
- `pbm_caused`
- `mixed`
- `user_reported_only`
- `unknown`

Allowed `attribution_basis` values:

- `denial_letter`
- `eob`
- `appeal_decision`
- `prior_auth_notice`
- `provider_directory`
- `sbc_or_eoc`
- `claim_payment_record`
- `collection_notice`
- `resolver_confirmation`
- `regulator_confirmation`
- `user_testimony`
- `manual_review`

### 6.7 Price graph tables

Create or normalize:

- `price_sources`
- `price_source_snapshots`
- `price_observations`
- `price_code_crosswalks`
- `price_benchmark_snapshots`
- `price_user_observed_amounts`
- `price_quality_context`

Important fields for `price_observations`:

- `source_type`
- `source_registry_id`
- `source_snapshot_id`
- `facility_ccn`
- `provider_npi`
- `payer_name`
- `plan_name`
- `network_name`
- `billing_code_type`
- `billing_code`
- `service_label`
- `gross_charge_cents`
- `cash_price_cents`
- `negotiated_rate_cents`
- `allowed_amount_cents`
- `patient_responsibility_cents`
- `observation_date`
- `effective_start_date`
- `effective_end_date`
- `confidence`
- `limitations`

### 6.8 Complaint and packet tables

Create:

- `comp_routes`
  - federal, state, provider, payer, employer, nonprofit, legal-aid, attorney, and media/research routing options.

- `comp_route_rules`
  - condition rules that map case facts to route candidates.

- `comp_packets`
  - packet metadata, generated documents, included evidence, and user approvals.

- `comp_packet_exports`
  - download, email, portal, and API export attempts.

- `comp_submissions`
  - submission destination, status, confirmation number, response due date, and user follow-up.

### 6.9 Resolver network tables

Create:

- `res_organizations`
- `res_users`
- `res_org_verifications`
- `res_case_shares`
- `res_case_notes`
- `res_case_actions`
- `res_conflict_checks`
- `res_outcome_confirmations`

The critical safety invariant:

- A resolver sees a case only after explicit active user consent and only within the consented scope.

---

## 7. Plan-Level Outcome Attribution Model

This is the new first-class pillar requested by the user.

### 7.1 The core accountability question

For each consumer case, MediCosts should be able to answer:

1. What plan did this person have at the time?
2. What did that plan appear to promise?
3. What actually happened?
4. Which actor controlled or contributed to the outcome?
5. What documents support that conclusion?
6. How confident is MediCosts?
7. What could the user or a helper do with this evidence?

### 7.2 Coverage identity is time-bound

A user can have different plans across time. Every case must tie to a coverage window:

- `coverage_start_date`
- `coverage_end_date`
- `plan_year`
- `service_date`
- `claim_date`
- `denial_date`
- `appeal_date`

If a case spans multiple plans, create multiple coverage links.

### 7.3 Benefit promise versus lived outcome

The plan-level accountability product should be built around a simple comparison:

- **Promise:** the plan said this benefit, provider, drug, service, network, cost share, appeal right, or protection existed.
- **Outcome:** the user experienced a denial, delay, unexpected cost, debt, collection, network failure, or appeal result.
- **Evidence:** the promise and outcome are both supported by records.
- **Attribution:** the outcome is connected to the plan, payer, provider, collector, or unknown actor with confidence.

Examples:

- SBC says emergency care is covered; EOB and bill show excessive patient responsibility after an emergency episode.
- Provider directory says a clinician is in network; claim is processed out of network.
- Formulary says a drug is preferred; pharmacy claim shows unexpected cost or prior authorization barrier.
- Plan denial letter cites medical necessity; appeal overturns the denial.
- EOB says patient owes $1,200; provider bill says patient owes $2,900.
- In-network facility uses an out-of-network ancillary clinician, creating a surprise bill.

### 7.4 Evidence strength ladder

Use this ladder throughout the UI and public aggregation pipeline:

1. `user_reported`: consumer describes the issue.
2. `document_backed`: uploaded document supports the issue.
3. `source_correlated`: public or plan source supports the claim.
4. `resolver_confirmed`: advocate, provider, payer, or employer confirms outcome.
5. `regulator_confirmed`: official complaint response or regulator record confirms outcome.
6. `legal_order_confirmed`: court, settlement, arbitration, or formal legal order confirms outcome.

Only `document_backed` or stronger evidence should be used for plan accountability scorecards.

### 7.5 Attribution confidence

Use a 0-1 confidence value plus a plain-language label:

- `0.00-0.39`: unverified.
- `0.40-0.59`: plausible.
- `0.60-0.79`: supported.
- `0.80-0.94`: strong.
- `0.95-1.00`: confirmed.

Rules:

- User testimony alone cannot produce `strong` or `confirmed`.
- A matching denial letter can support plan attribution.
- A corrected bill can support provider attribution.
- An appeal reversal can support a plan-process outcome, but not automatically bad faith.
- A provider-directory mismatch needs directory evidence from the relevant date or a reasonable snapshot.
- A debt collector letter supports collector involvement but not necessarily provider or payer fault.

### 7.6 Outcome categories

Track at least:

- `denied_care`
- `delayed_care`
- `prior_auth_barrier`
- `appeal_denied`
- `appeal_won`
- `out_of_network_surprise`
- `provider_directory_inaccuracy`
- `formulary_failure`
- `incorrect_patient_responsibility`
- `claim_underpaid`
- `claim_not_paid`
- `balance_bill`
- `medical_debt_created`
- `sent_to_collections`
- `credit_reporting`
- `refund_received`
- `bill_corrected`
- `debt_forgiven`
- `charity_care_approved`
- `case_unresolved`
- `user_reported_harm`

### 7.7 Plan accountability scorecards

Scorecards should be produced only after privacy and evidence thresholds are met.

Possible dimensions:

- Volume of document-backed complaints by plan and market.
- Complaint rate per available enrollment denominator where an appropriate denominator exists.
- Appeal win rate for user-submitted cases.
- Time to resolution.
- Refund or correction rate.
- Average disputed amount.
- Network accuracy complaints.
- Surprise-bill pattern.
- Debt/collection escalation pattern.
- Benefit-promise mismatch categories.
- Public source quality ratings and complaints context.

Scorecards must display limitations:

- MediCosts user base may not be representative.
- Case volume may reflect awareness or outreach, not only plan behavior.
- Public quality ratings and user complaints measure different things.
- Some outcomes are provider-caused, collector-caused, or mixed.
- Self-funded employer plans may not map cleanly to state insurance jurisdiction.

### 7.8 Public plan accountability release gate

Before launching public scorecards:

- Require counsel review.
- Require data science review.
- Require privacy review.
- Require minimum case threshold per cell.
- Require source provenance.
- Require dispute/correction channel for payers and providers.
- Require a public methodology page.
- Require clear distinction between verified cases and user reports.

---

## 8. User Journeys

### 8.1 Check a bill

1. User starts a bill-check case.
2. User enters or uploads bill, EOB, denial letter, collection notice, and insurance card.
3. System extracts fields.
4. User reviews extracted fields.
5. Deterministic rules run.
6. System creates findings and a leverage score.
7. System identifies likely responsible actors.
8. System produces action options.
9. User creates a packet.
10. User shares with provider, payer, advocate, employer, or regulator.
11. Responses and outcomes are tracked.
12. Resolved outcomes feed de-identified accountability metrics.

### 8.2 File or track a complaint

1. User selects issue type.
2. System asks jurisdiction and coverage questions.
3. System asks for documents.
4. System routes issue to likely channels.
5. User chooses destination.
6. System prepares a complaint packet.
7. User downloads or submits.
8. System records confirmation numbers and deadlines.
9. System reminds user about follow-up.
10. Final result updates case outcomes and attribution.

### 8.3 Choose coverage

1. User adds doctors, hospitals, drugs, expected services, household, and ZIP.
2. User imports or selects candidate plans.
3. System checks network, formulary, benefits, premiums, deductible, OOP max, cost-sharing, and plan ratings.
4. System estimates expected annual cost under scenarios.
5. System shows risk bands.
6. System shows plan accountability signals where evidence thresholds are met.
7. User saves coverage profile.

### 8.4 Prove plan-level harm

1. User uploads insurance card, SBC, EOC, denial, EOB, appeal letter, provider directory screenshot, bills, and collection letters.
2. System normalizes coverage identity.
3. System extracts benefit promises.
4. System compares promises to outcomes.
5. System identifies actor attribution with confidence.
6. System generates a payer-plan evidence packet.
7. User shares packet with employer, payer, regulator, advocate, or attorney.
8. Resolver response becomes evidence.
9. De-identified outcome contributes to plan accountability only after thresholding.

---

## 9. Implementation Phases

The phases are ordered to avoid unsafe public claims before the evidence model exists.

### Phase 0 - Baseline, governance, and source registry

**Goal:** Create the foundation for evidence-backed consumer work.

**Backend tasks:**

- Add `docs/current-state-consumer.md`.
- Add `docs/product/consumer-truth-contract.md`.
- Add `docs/security/consumer-data-threat-model.md`.
- Add `server/lib/source-registry-migrate.js`.
- Add `source_registry`, `source_snapshots`, and `source_quality_checks`.
- Add a protected admin route for source freshness.
- Add tests for source registry migration output.

**Frontend tasks:**

- Add an internal source-freshness admin panel or extend Data Connectors.
- Add reusable `EvidenceBadge`, `ConfidenceBadge`, and `FreshnessBadge`.

**Data tasks:**

- Register existing major sources: CMS hospital data, Medicare inpatient, Open Payments, Part D, HCRIS, HRSA, CDC PLACES, ClearNetwork, and existing transparency assets.
- Record license, source owner, URL, cadence, last fetch, parser version, and caveats.

**Acceptance criteria:**

- Every new consumer finding can reference a source registry entry.
- The app distinguishes public source, user document, inferred field, and manual review.
- `cd server && npm test` remains green.

**Risks:**

- Source metadata can become stale if not tied to ingestion jobs.
- Source licenses and terms need counsel review before commercial use.

### Phase 1 - Consumer case workspace

**Goal:** Add the private, authenticated workspace where cases live.

**Backend tasks:**

- Add `server/lib/consumer-migrate.js`.
- Add `con_cases`, `con_case_parties`, `con_case_events`, `con_case_outcomes`, `con_documents`, `con_evidence_items`, `con_consent_grants`, and `con_audit_events`.
- Add `server/routes/consumer-cases.js`.
- Mount under `app.use('/api/cases', consumerCasesRouter)`.
- Add service functions for create/list/read/update/archive.
- Enforce user ownership on every read and write.
- Add audit events for case reads and writes.

**Frontend tasks:**

- Add `client/src/views/ConsumerHome.jsx`.
- Add `client/src/views/MyCases.jsx`.
- Add `client/src/views/CaseDetail.jsx`.
- Add navigation group "My Healthcare Costs".
- Replace or supplement `/for-patients` with case-backed workflows.

**API endpoints:**

- `GET /api/cases`
- `POST /api/cases`
- `GET /api/cases/:caseId`
- `PATCH /api/cases/:caseId`
- `POST /api/cases/:caseId/events`
- `POST /api/cases/:caseId/archive`

**Tests:**

- User can create a case.
- User can list own cases.
- User cannot read another user's case.
- Audit event is created.
- Soft delete hides archived/deleted cases.

**Acceptance criteria:**

- A logged-in user can create a bill-check case and return to it later.
- No PHI is exposed in logs.
- Ownership tests are explicit.

### Phase 2 - Consent, audit, and privacy controls

**Goal:** Build consent before any resolver, public-aggregate, or document-upload feature.

**Backend tasks:**

- Add consent service.
- Add signed HIPAA authorization / medical record release service.
- Add `con_medical_record_releases` with template version, counsel status, signature artifact, signer type, representative authority, expiration, and revocation.
- Add upload-gate helper: `requireActiveMedicalRecordRelease(userId, caseId)`.
- Add field-level sensitivity tags for serializers.
- Add audit middleware helpers.
- Add data export endpoint.
- Add consent revocation endpoint.
- Add deletion request workflow.
- Add release revocation endpoint.

**Frontend tasks:**

- Add consent screens for:
  - HIPAA authorization / medical record release before uploads
  - store documents
  - AI extraction
  - share with helper
  - share de-identified aggregate signal
  - contact provider/payer/regulator
- Add signed-release review and signature flow before any upload control appears.
- Add release status badge on case detail.
- Add privacy settings.
- Add case sharing status.

**Tests:**

- Upload endpoints reject without active signed release.
- Expired release blocks upload.
- Revoked release blocks upload, third-party requests, resolver shares, and packet exports that rely on it.
- Representative signature requires authority description.
- Revoked consent blocks resolver access.
- Export excludes other users' data.
- Audit logs are created on sensitive access.
- Public aggregate projection excludes PHI fields.

**Acceptance criteria:**

- No user can upload documents without an active signed HIPAA authorization / medical record release.
- No packet export or resolver share can happen without active consent.
- Users can see who has access to each case.

### Phase 3 - Plan identity foundation

**Goal:** Make insurer, payer, plan, network, and benefit year first-class before outcomes are attributed.

**Backend tasks:**

- Add `server/lib/plan-migrate.js`.
- Add `plan_coverage_profiles`, `plan_source_records`, `plan_benefit_promises`, and `plan_network_evidence`.
- Add `server/routes/plans.js`.
- Add plan identity resolver service.
- Add coverage profile CRUD.
- Add insurance-card extraction schema.
- Add manual plan identity entry.
- Add plan source matching for HIOS and Medicare contract/plan IDs where available.

**Frontend tasks:**

- Add `CoverageProfileEditor`.
- Add insurance card upload/manual entry flow.
- Add coverage confidence indicator.
- Add "What plan was active for this case?" step inside case intake.

**Data tasks:**

- Register CMS Exchange PUFs.
- Register CMS Marketplace Quality Rating System.
- Register CMS Part C and D performance data.
- Register ClearNetwork plan/network sources.
- Add ingestion plan for plan attributes, benefits/cost sharing, service areas, rates, and quality where accessible.

**Tests:**

- Coverage profile can be created manually.
- Coverage profile can be linked to a case.
- Case cannot show plan-accountability output without coverage identity.
- Confidence falls back to unknown when identifiers are incomplete.

**Acceptance criteria:**

- Every case can be linked to zero, one, or many coverage profiles.
- Unknown coverage is allowed, but explicitly marked.
- Plan identity is stored separately from consumer documents.

### Phase 4 - Outcome attribution foundation

**Goal:** Implement the user's plan-outcome evidence requirement as core infrastructure.

**Backend tasks:**

- Add `plan_outcome_attributions`.
- Add attribution service that creates draft attribution records from case facts.
- Add manual review states.
- Add evidence strength ladder.
- Add benefit-promise mismatch detector.
- Add actor taxonomy.
- Add attribution confidence calculator.
- Add private packet view: "How this outcome ties to your plan."

**Frontend tasks:**

- Add `PlanOutcomeEvidencePanel`.
- Add `BenefitPromiseComparison`.
- Add `AttributionConfidenceBadge`.
- Add user correction flow for payer/plan identity.
- Add "not sure" and "unknown" states visibly.

**Initial attribution rules:**

- EOB patient responsibility mismatch ties to payer/plan if EOB identifies payer and claim.
- Denial letter ties to payer/plan if letter identifies plan or insurer.
- Provider-directory mismatch ties to plan only when directory evidence exists.
- Balance bill ties to provider unless payer/network evidence supports plan contribution.
- Collection notice ties to collector and original creditor; payer attribution remains unknown unless EOB/claim evidence supports it.
- Appeal reversal ties to plan process but does not imply intent.

**Tests:**

- User report alone creates `user_reported_only`, not `plan_caused`.
- Denial letter plus coverage profile creates supported plan attribution.
- Directory screenshot plus out-of-network EOB creates plan-contributed attribution.
- Debt collector letter alone does not blame plan.
- Public projection excludes attribution below threshold.

**Acceptance criteria:**

- A case can produce an evidence packet showing plan, promise, outcome, attribution, and confidence.
- The app never claims plan fault without evidence.
- Public plan scorecards remain disabled until Phase 11.

### Phase 5 - Bill-check MVP on existing leverage engine

**Goal:** Turn the deterministic leverage engine into a consumer product.

**Backend tasks:**

- Add `server/routes/leverage-cases.js` or extend `consumer-cases`.
- Add case-to-leverage adapter from `con_cases` to `lev_cases`.
- Add manual claim entry endpoint.
- Add line item entry endpoint.
- Add analyze endpoint that calls `judgeCase`.
- Store `lev_findings` and `lev_case_scores`.
- Link `lev_findings.evidence_refs` to `con_evidence_items`.

**Frontend tasks:**

- Add `CheckBillIntake`.
- Add `BillLineItemEditor`.
- Add `BillAnalysisReport`.
- Add report tabs: summary, findings, evidence, next steps, packet.
- Add "what MediCosts does not know yet" section.

**Tests:**

- Manual claim can be analyzed.
- Overcharge rule appears with frozen benchmark snapshot.
- Duplicate line finding references source line items.
- EOB mismatch finding links to EOB evidence.
- Case ownership is enforced.

**Acceptance criteria:**

- A user can manually enter a bill/EOB and receive a deterministic report.
- Findings are not generated by AI.
- Existing server Vitest suite remains green.

### Phase 6 - Document vault and extraction pipeline

**Goal:** Let users upload evidence safely and review extracted fields.

**Backend tasks:**

- Enforce active signed HIPAA authorization / medical record release before accepting upload bytes.
- Link each `con_documents` row to `medical_record_release_id`.
- Add file upload route with size and MIME restrictions.
- Add malware scanning hook or quarantine state.
- Add encrypted or access-controlled object storage path.
- Add document processing queue interface.
- Add OCR/extraction abstraction.
- Add extraction result review service.
- Add prompt-injection guardrails for AI extraction.

**Frontend tasks:**

- Add document upload panel that is disabled until release status is active.
- Add release-required empty state with link to sign or renew the release.
- Add extracted field review.
- Add side-by-side document/evidence validation.
- Add redaction preview for packets.

**Document types:**

- Bill.
- Itemized bill.
- EOB.
- Denial letter.
- Appeal letter.
- Collection notice.
- Credit report excerpt.
- Insurance card.
- SBC.
- EOC.
- Provider directory screenshot or PDF.
- Financial assistance application.
- Good Faith Estimate.
- Consent or authorization form.

**Tests:**

- Upload UI does not expose file controls without active release.
- Upload API rejects missing, expired, or revoked release.
- Stored document metadata includes release ID and release template version.
- Unsupported file types are rejected.
- Large files are rejected.
- Documents are scoped to owner.
- Extracted fields require review before high-confidence findings.
- Prompt-injection text in a PDF is ignored by Abby/action generation.

**Acceptance criteria:**

- User can upload documents into a case only after signing the HIPAA authorization / medical record release.
- Extracted fields are visible and correctable.
- Documents do not become public data.

### Phase 7 - Complaint routing hub

**Goal:** Convert cases into destination-aware routes and packets.

**Backend tasks:**

- Add `comp_routes`, `comp_route_rules`, `comp_packets`, `comp_packet_exports`, and `comp_submissions`.
- Add route-rule engine.
- Seed federal route records.
- Add state route placeholder model.
- Add destination requirements and evidence checklist.
- Add packet generation service.

**Frontend tasks:**

- Add `ComplaintRouter`.
- Add route comparison.
- Add evidence checklist.
- Add packet preview.
- Add confirmation-number tracker.
- Add response deadline tracker.

**Initial official route seeds:**

- CMS No Surprises complaint and help path.
- CFPB complaint path for medical debt, debt collection, and credit reporting.
- NAIC/state insurance department path for state insurance complaints.
- HHS OCR path for privacy/HIPAA complaints.
- DOL EBSA path for employer health plan claims and appeals.
- Provider/facility billing office.
- Hospital financial assistance office.
- Insurer/member services and appeals.
- Employer benefits or plan administrator.

**Tests:**

- Surprise-bill case recommends CMS No Surprises route and provider/payer route.
- Medical-debt collection case recommends CFPB and original provider route.
- Privacy case recommends HHS OCR route.
- Employer self-funded plan case suggests DOL EBSA/plan administrator path, not only state DOI.
- User can choose not to route.

**Acceptance criteria:**

- User receives route options with evidence checklists.
- Packets are generated only after user approval.
- Official route URLs and requirements are source-backed.

### Phase 8 - Action packet factory

**Goal:** Make every finding actionable.

**Backend tasks:**

- Add packet templates.
- Add counsel-reviewed copy registry.
- Add packet versioning.
- Add packet evidence manifest.
- Add redaction profile.
- Add packet export PDF generation.
- Add packet download audit event.

**Frontend tasks:**

- Add packet builder.
- Add packet preview with included evidence.
- Add edit/review workflow.
- Add "send myself" and "download" first.
- Add "submit/share" only after resolver and consent controls are mature.

**Packet types:**

- Provider billing dispute.
- Itemized bill request.
- Charity-care request.
- Insurer appeal.
- No Surprises complaint prep.
- GFE dispute prep.
- Debt validation request.
- Credit reporting dispute support.
- Employer benefits escalation.
- Regulator complaint packet.
- Payer-plan outcome evidence packet.

**Tests:**

- Packet includes evidence manifest.
- Packet omits non-consented documents.
- Packet redacts member ID if redaction enabled.
- Packet version is immutable after export.

**Acceptance criteria:**

- A user can download a professional evidence-backed packet.
- Every factual statement in the packet links to evidence.

### Phase 9 - Financial relief and medical debt workflows

**Goal:** Help users reduce debt and avoid avoidable harm.

**Backend tasks:**

- Add financial-assistance screening schema.
- Add hospital FAP source registry entries.
- Add household/income-band model.
- Add debt status fields.
- Add collection timeline.
- Add FDCPA/FCRA counsel-gated rule placeholders.

**Frontend tasks:**

- Add `FindFinancialRelief`.
- Add FAP eligibility screener.
- Add debt timeline.
- Add task list for itemized bill, FAP, dispute, payment plan, debt validation, credit dispute.

**Tests:**

- FAP screening does not expose tax/legal advice.
- Household/income data is marked sensitive.
- Collection deadlines are clearly labeled as estimated until counsel-reviewed.

**Acceptance criteria:**

- User can identify likely financial-assistance path.
- User can produce a charity-care packet.
- Debt and collections workflows avoid unsafe advice.

### Phase 10 - Price truth graph and estimator v2

**Goal:** Upgrade the estimator into a plan-aware cost truth product.

**Backend tasks:**

- Add `price_observations`.
- Add price source normalization service.
- Add procedure/code search service.
- Add provider/facility/payer/plan joins.
- Add uncertainty/range calculator.
- Add out-of-pocket estimator using coverage profile fields.
- Add price explanation service.

**Frontend tasks:**

- Replace standalone estimator with `ShopCare`.
- Add procedure search.
- Add ZIP and saved plan filters.
- Add care setting comparison.
- Add confidence and source breakdown.
- Add save-to-case flow.

**Tests:**

- Estimator returns range, not single false precision.
- Missing deductible shows incomplete estimate.
- User-observed EOB amount is displayed as user-submitted evidence, not public truth.
- Source freshness is visible.

**Acceptance criteria:**

- User can compare facilities for a procedure with plan-aware context where available.
- User can save estimate into a case.

### Phase 11 - Coverage choice and plan accountability

**Goal:** Help users choose coverage and expose plan patterns responsibly.

**Backend tasks:**

- Ingest Marketplace PUF plan attributes, benefits/cost sharing, rates, service areas, and quality where available.
- Ingest or link Medicare Advantage and Part D quality/performance sources.
- Add drug and provider fit scoring.
- Add expected annual cost model.
- Add plan accountability aggregate tables.
- Add privacy thresholding.
- Add correction/dispute workflow for plan scorecards.

**Frontend tasks:**

- Add `ChooseCoverage`.
- Add candidate plan comparison.
- Add doctors/drugs/services input.
- Add expected cost scenarios.
- Add plan-fit score.
- Add plan accountability tab.
- Add methodology and caveats.

**Plan accountability outputs:**

- Evidence-backed case volume by plan.
- Outcome categories by plan.
- Appeal outcomes where known.
- Median time to resolution.
- Average disputed and corrected amounts.
- Public quality ratings context.
- Complaint routing outcomes.

**Tests:**

- No public plan cell renders below threshold.
- User-reported-only cases are separated from document-backed cases.
- Self-funded plan cases are not incorrectly assigned to state DOI jurisdiction.
- Plan scorecard links to methodology.

**Acceptance criteria:**

- Users can compare plans by cost, fit, and accountability context.
- Public plan accountability does not expose PHI.
- Payers can submit corrections or responses.

### Phase 12 - Resolver network and helper portal

**Goal:** Let people with power to help resolve cases.

**Backend tasks:**

- Add resolver organization model.
- Add resolver user invitations.
- Add organization verification workflow.
- Add conflict check fields.
- Add scoped case shares.
- Add resolver audit events.
- Add resolver notes.
- Add outcome confirmation workflow.

**Frontend tasks:**

- Add resolver portal.
- Add case inbox.
- Add evidence viewer.
- Add action checklist.
- Add response template.
- Add outcome confirmation form.
- Add consent scope display.

**Tests:**

- Resolver cannot access unshared cases.
- Revoked consent removes resolver access.
- Resolver notes are visible according to policy.
- Resolver confirmation updates outcome evidence strength.

**Acceptance criteria:**

- A user can share a case with a verified resolver.
- Resolver can respond and confirm outcome.
- All access is audited.

### Phase 13 - Public accountability layer

**Goal:** Publish de-identified aggregate insights safely.

**Backend tasks:**

- Add `pub_case_aggregates`.
- Add `pub_plan_scorecards`.
- Add `pub_provider_billing_patterns`.
- Add `pub_source_freshness`.
- Add aggregation jobs.
- Add thresholding library.
- Add public methodology endpoints.

**Frontend tasks:**

- Add public accountability dashboards.
- Add filters for state, payer, plan, facility, issue type, and date bucket.
- Add methodology pages.
- Add correction/report issue forms.

**Tests:**

- Aggregates exclude PHI fields.
- Small cells are suppressed.
- Public API cannot drill down to individual cases.
- Source freshness displays accurately.

**Acceptance criteria:**

- Public pages show systemic signals without exposing any individual case.
- Methodology is understandable and conservative.

### Phase 14 - Integrations and imports

**Goal:** Reduce manual work by connecting to user-authorized sources.

**Integration candidates:**

- Blue Button 2.0 for Medicare claims where applicable.
- CMS Interoperability and Patient Access APIs from payers where available.
- Payer claims APIs.
- FHIR resources for explanation of benefit.
- Pharmacy claims and formulary APIs where available.
- Email forwarding or parser for EOBs and bills.
- Consumer document import from cloud storage.

**Backend tasks:**

- Add OAuth connection registry.
- Add token vault.
- Add connector consent.
- Add import queue.
- Add source-specific provenance.
- Add duplicate detection.

**Frontend tasks:**

- Add connected accounts.
- Add import status.
- Add imported claim review.
- Add disconnect and delete controls.

**Tests:**

- Revoking connector consent stops imports.
- Imported EOB maps to case evidence.
- Token data is not logged.

**Acceptance criteria:**

- User can import supported data with consent.
- Imported records preserve source provenance.

### Phase 15 - Abby case-aware advocate

**Goal:** Make Abby useful without making Abby unsafe.

**Backend tasks:**

- Add case context provider with sensitivity filtering.
- Add retrieval only from user-owned case.
- Add source citation constraints.
- Add response policy for medical/legal/debt advice.
- Add packet drafting tool.
- Add model audit logs.

**Frontend tasks:**

- Add Abby panel on case detail.
- Add suggested questions.
- Add "insert into packet draft" flow.
- Add evidence citations in chat.

**Tests:**

- Abby cannot access another user's case.
- Abby refuses to invent legal claims.
- Abby cites evidence IDs.
- Abby ignores prompt injection inside uploaded documents.

**Acceptance criteria:**

- Abby can explain a case report and draft user-reviewed text.
- Abby never becomes the authority for findings.

### Phase 16 - Operations, reliability, and compliance readiness

**Goal:** Make the system safe enough for real consumer harm cases.

**Backend tasks:**

- Add structured logging with PHI redaction.
- Add error budgets.
- Add backup and restore runbooks.
- Add incident-response runbook.
- Add admin break-glass access with justification.
- Add retention policy jobs.
- Add data deletion jobs.
- Add job observability.

**Frontend tasks:**

- Add user-visible status for packet generation, extraction, and connector imports.
- Add support/contact paths.
- Add transparent failure messages.

**Tests and reviews:**

- Security review.
- Privacy review.
- Counsel review.
- Accessibility audit.
- Load test on case list and packet generation.
- Backup restore test.

**Acceptance criteria:**

- The product has operational runbooks.
- Sensitive data is auditable and deletable within policy.
- The team can respond to privacy and safety incidents.

---

## 10. Detailed First 90 Days

### Days 1-14: Case foundation and plan identity

Deliverables:

- `docs/current-state-consumer.md`
- `docs/product/consumer-truth-contract.md`
- `docs/security/consumer-data-threat-model.md`
- `server/lib/consumer-migrate.js`
- `server/routes/consumer-cases.js`
- `con_medical_record_releases` schema and release-gate helper
- `client/src/views/ConsumerHome.jsx`
- `client/src/views/MyCases.jsx`
- `client/src/views/CaseDetail.jsx`
- `server/lib/plan-migrate.js`
- `server/routes/plans.js`
- `CoverageProfileEditor`

Exit criteria:

- User can create and list cases.
- User can add coverage profile.
- Case can link to coverage profile.
- Upload gate exists even before the full document vault ships.
- Ownership tests pass.
- Audit events are emitted.

### Days 15-30: Bill-check MVP

Deliverables:

- Manual bill/EOB entry.
- Case-to-leverage adapter.
- Analyze endpoint.
- Bill analysis report.
- Finding evidence references.
- Initial action recommendations.

Exit criteria:

- A user can create a bill-check case and receive deterministic findings.
- Findings link to entered evidence.
- No AI-generated findings.
- Server tests pass.

### Days 31-45: Outcome attribution foundation

Deliverables:

- `plan_outcome_attributions`
- Attribution service.
- Evidence strength ladder.
- Benefit-promise comparison model.
- Plan outcome evidence panel.
- Payer-plan packet skeleton.

Exit criteria:

- EOB mismatch, denial, directory mismatch, and collection cases produce correct attribution states.
- User-reported-only cases do not become public plan blame.
- Packet shows plan, promise, outcome, evidence, and confidence.

### Days 46-60: Complaint routing and packet MVP

Deliverables:

- Complaint route seed data.
- Route-rule engine.
- Packet templates.
- Evidence manifest.
- Packet download.
- Response deadline tracker.

Exit criteria:

- User can generate a provider billing dispute packet.
- User can generate a payer appeal packet.
- User can generate a No Surprises complaint prep packet.
- User can generate a medical-debt complaint prep packet.

### Days 61-75: Document vault and extraction

Deliverables:

- Upload endpoint.
- Document vault UI.
- OCR/extraction abstraction.
- Extracted field review.
- Insurance card extraction.
- EOB/bill field extraction.

Exit criteria:

- User can upload, review, and correct extracted facts.
- Corrected facts feed bill-check and plan attribution.
- Documents remain private and audited.

### Days 76-90: Price graph and coverage choice start

Deliverables:

- Price source registry expansion.
- Initial `price_observations`.
- Procedure search service.
- Plan-aware estimate skeleton.
- Marketplace PUF ingestion design.
- Plan fit prototype.

Exit criteria:

- Existing estimator path has a replacement plan and first API shape.
- Plan choice prototype can compare basic plan cost/risk fields.
- Plan accountability remains private or thresholded only.

---

## 11. API Surface Plan

### 11.1 Consumer cases

- `GET /api/cases`
- `POST /api/cases`
- `GET /api/cases/:caseId`
- `PATCH /api/cases/:caseId`
- `POST /api/cases/:caseId/events`
- `GET /api/cases/:caseId/outcomes`
- `POST /api/cases/:caseId/outcomes`

### 11.2 Documents and evidence

- `GET /api/cases/:caseId/medical-record-release`
- `POST /api/cases/:caseId/medical-record-release`
- `POST /api/cases/:caseId/medical-record-release/revoke`
- `POST /api/cases/:caseId/documents`
- `GET /api/cases/:caseId/documents`
- `GET /api/cases/:caseId/documents/:documentId`
- `DELETE /api/cases/:caseId/documents/:documentId`
- `GET /api/cases/:caseId/evidence`
- `PATCH /api/cases/:caseId/evidence/:evidenceId`

`POST /api/cases/:caseId/documents` must reject unless `medical-record-release` is active for the user and case.

### 11.3 Coverage and plans

- `GET /api/plans/coverage-profiles`
- `POST /api/plans/coverage-profiles`
- `GET /api/plans/coverage-profiles/:coverageProfileId`
- `PATCH /api/plans/coverage-profiles/:coverageProfileId`
- `POST /api/cases/:caseId/coverage-links`
- `GET /api/cases/:caseId/plan-outcomes`
- `POST /api/cases/:caseId/plan-outcomes/recalculate`

### 11.4 Leverage and findings

- `POST /api/cases/:caseId/claims`
- `POST /api/cases/:caseId/claims/:claimId/line-items`
- `POST /api/cases/:caseId/analyze`
- `GET /api/cases/:caseId/findings`
- `GET /api/cases/:caseId/leverage-score`

### 11.5 Complaints and packets

- `GET /api/cases/:caseId/complaint-routes`
- `POST /api/cases/:caseId/complaint-routes/recalculate`
- `POST /api/cases/:caseId/packets`
- `GET /api/cases/:caseId/packets`
- `GET /api/cases/:caseId/packets/:packetId`
- `POST /api/cases/:caseId/packets/:packetId/export`
- `POST /api/cases/:caseId/submissions`

### 11.6 Resolver network

- `GET /api/resolvers/organizations`
- `POST /api/resolvers/organizations`
- `POST /api/cases/:caseId/shares`
- `GET /api/cases/:caseId/shares`
- `DELETE /api/cases/:caseId/shares/:shareId`
- `GET /api/resolver/cases`
- `GET /api/resolver/cases/:caseId`
- `POST /api/resolver/cases/:caseId/notes`
- `POST /api/resolver/cases/:caseId/outcomes`

### 11.7 Public accountability

- `GET /api/public/source-freshness`
- `GET /api/public/costs`
- `GET /api/public/plans`
- `GET /api/public/providers`
- `GET /api/public/methodology`

Public endpoints must use separate serializers and never return private case data.

---

## 12. Rule Engine Expansion Plan

### 12.1 Existing deterministic rules to preserve

- `OVERCHARGE_MEDICARE_MULTIPLE`
- `NCCI_UNBUNDLING`
- `MUE_UNIT_EXCESS`
- `DUPLICATE_LINE`
- `EOB_PATIENT_RESP_MISMATCH`

### 12.2 New rule categories

Add rules in stages:

- Plan identity and evidence quality rules.
- Benefit promise mismatch rules.
- Network accuracy rules.
- Prior authorization and denial rules.
- Appeal deadline rules.
- Charity-care screening rules.
- No Surprises and GFE counsel-gated rules.
- Debt validation and collection counsel-gated rules.
- Credit reporting counsel-gated rules.
- State-specific billing and debt rules.

### 12.3 Rule metadata

Every rule should include:

- `rule_id`
- `version`
- `jurisdiction`
- `case_types`
- `required_evidence`
- `optional_evidence`
- `counsel_status`
- `public_copy_key`
- `internal_notes`
- `test_fixture_ids`
- `last_reviewed_at`

### 12.4 Rule test standard

Each rule must have:

- Positive case.
- Negative case.
- Missing evidence case.
- Ambiguous evidence case.
- Ownership/scope test if it touches case data.
- Snapshot of expected evidence refs.

---

## 13. Complaint Routing Matrix

This matrix should seed `comp_routes` and `comp_route_rules`.

| Issue | Likely destinations | Required evidence | First product action |
|---|---|---|---|
| Surprise medical bill | CMS No Surprises, provider, payer | bill, EOB, facility/provider status, service date | prepare complaint packet and payer/provider dispute |
| GFE dispute | CMS/process support, provider | GFE, final bill, service date, uninsured/self-pay status | compare estimate to bill and prep dispute |
| Medical debt collection | CFPB, collector, provider, credit bureau if applicable | collection notice, bill, EOB, account info, dates | debt timeline and complaint packet |
| Credit reporting | CFPB, credit bureau, collector | credit report excerpt, collection notice, dispute history | credit dispute support packet |
| Denied claim | insurer, employer plan admin, DOL EBSA or state DOI depending plan type | denial letter, EOB, plan docs, appeal history | appeal packet |
| Prior authorization delay | insurer, provider, employer plan admin | prior auth notice, messages, dates, plan docs | escalation packet |
| Network directory error | insurer, state DOI, provider, employer plan admin | directory snapshot, claim/EOB, appointment/bill evidence | plan-outcome evidence packet |
| HIPAA/privacy issue | HHS OCR, provider/payer privacy office | notice, records request, denial, correspondence | OCR prep packet |
| Charity-care denial | hospital FAP office, state AG/charity-care agency where relevant | income band, bill, FAP denial, hospital FAP policy | charity-care appeal packet |
| Incorrect provider bill | provider billing office, insurer, advocate | bill, EOB, itemized bill, payment history | billing dispute packet |
| Employer self-funded plan problem | plan administrator, employer benefits, DOL EBSA | plan docs, denial, EOB, employer plan info | benefits escalation packet |

Routing must remain suggestive unless counsel-approved. The UI should say "Possible routes" and explain why each route appears.

---

## 14. Data Sources To Register

### 14.1 Existing internal or project-adjacent sources

- Medicare inpatient and outpatient benchmark data.
- Hospital quality and HCAHPS data.
- Clinician directory and NPPES-derived records.
- Open Payments.
- Part D prescriber and drug spending data.
- HCRIS financial data.
- HRSA shortage areas.
- CDC PLACES community health.
- ClearNetwork payer, plan, provider, and MRF-derived network data.
- Existing crawler framework for Transparency in Coverage and hospital chargemaster sources.

### 14.2 Official and primary external sources for next phases

Register these with source metadata, refresh cadence, and license/terms review:

- CMS Hospital Price Transparency: `https://www.cms.gov/priorities/key-initiatives/hospital-price-transparency`
- CMS Transparency in Coverage: `https://www.cms.gov/healthplan-price-transparency`
- CMS Hospital Price Transparency GitHub validator/schema: `https://github.com/CMSgov/hospital-price-transparency`
- CMS No Surprises rights and complaint path: `https://www.cms.gov/medical-bill-rights/help/submit-a-complaint`
- CMS No Surprises fact sheet: `https://www.cms.gov/newsroom/fact-sheets/no-surprises-understand-your-rights-against-surprise-medical-bills`
- IRS tax-exempt hospital financial assistance requirements: `https://www.irs.gov/charities-non-profits/charitable-hospitals-general-requirements-for-tax-exemption-under-section-501r`
- CFPB medical debt rule and resources: `https://www.consumerfinance.gov/rules-policy/medical-debt/`
- CFPB complaint portal: `https://www.consumerfinance.gov/complaint/`
- NAIC consumer insurance complaint routing: `https://content.naic.org/consumer`
- NAIC state insurance department directory: `https://content.naic.org/state-insurance-departments`
- HHS OCR HIPAA complaint instructions: `https://www.hhs.gov/hipaa/filing-a-complaint/index.html`
- HHS OCR complaint portal: `https://ocrportal.hhs.gov/ocr/cp/complaint_frontpage.jsf`
- DOL EBSA internal claims, appeals, and external review: `https://www.dol.gov/agencies/ebsa/laws-and-regulations/laws/affordable-care-act/for-employers-and-advisers/internal-claims-and-appeals`
- DOL EBSA filing a health benefits claim: `https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/publications/filing-a-claim-for-your-health-benefits`
- CMS Exchange Public Use Files: `https://www.cms.gov/marketplace/resources/data/public-use-files`
- CMS State-based Exchange Public Use Files: `https://www.cms.gov/marketplace/resources/data/state-based-public-use-files`
- CMS Marketplace Quality Rating System: `https://www.cms.gov/marketplace/about/health-insurance-quality-initiatives/quality-rating-system`
- CMS Part C and D performance data: `https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data`
- CMS Blue Button 2.0: `https://bluebutton.cms.gov/`
- CMS Interoperability and Patient Access final rule: `https://www.cms.gov/priorities/key-initiatives/burden-reduction/interoperability/policies-and-regulations/cms-interoperability-and-patient-access-final-rule`

### 14.3 Non-government sources to evaluate

Use only after terms/licensing review:

- KFF health policy and survey data.
- Peterson-KFF Health System Tracker.
- NCQA ratings/accreditation and HEDIS-related public material.
- FAIR Health or other claims benchmarks if licensed.
- State all-payer claims databases where available and permitted.
- State hospital charity-care datasets where available.
- Court records and enforcement actions where legally usable.

---

## 15. Privacy, Security, And Compliance Workstream

### 15.1 Threat model topics

- Broken access control across cases.
- Resolver over-access.
- Public aggregate re-identification.
- Prompt injection inside uploaded documents.
- Malicious PDF upload.
- PHI in logs.
- Member IDs and claim IDs in packets.
- Unauthorized admin access.
- Consent revocation failures.
- Data deletion failures.
- Email or export leakage.
- Cross-user Abby retrieval.

### 15.2 Baseline controls

- JWT-protected routes with per-resource ownership checks.
- Audit event for every case, document, packet, and resolver access.
- PHI redaction in logs.
- File type allowlist and scan/quarantine state.
- Encrypted storage or equivalent access controls.
- Consent ledger before sharing.
- Separate public serializers.
- K-anonymity or stricter thresholding for public aggregates.
- Admin break-glass workflow.

### 15.3 Reviews before consumer launch

- Security review.
- Privacy review.
- Counsel review.
- Accessibility review.
- Incident-response tabletop.
- Backup and restore test.
- Abuse-case review for public scorecards.

---

## 16. Metrics

### 16.1 Consumer usefulness metrics

- Cases created.
- Cases reaching report-ready state.
- Packets generated.
- Packets shared or downloaded.
- Bills corrected.
- Refund dollars.
- Debt reduced or forgiven.
- Charity-care approvals.
- Appeals filed.
- Appeals won or partially won.
- Average time to resolution.
- Consumer-reported usefulness.

### 16.2 Plan accountability metrics

- Cases with coverage profile.
- Cases with plan identity confidence above threshold.
- Cases with document-backed plan outcome attribution.
- Outcomes by payer/plan.
- Benefit-promise mismatch rate.
- Appeal reversal rate.
- Network inaccuracy cases.
- Incorrect cost-share cases.
- Debt/collection escalation after disputed claim.
- Median time from issue to resolution.
- Corrected amount by payer/plan.

### 16.3 Data quality metrics

- Source freshness.
- Parser error rate.
- Extraction confidence.
- Manual correction rate.
- Unknown plan identity rate.
- Unknown attribution rate.
- Public aggregate suppression rate.

### 16.4 Safety metrics

- Unauthorized access attempts blocked.
- Consent revocations honored.
- Resolver access reviews completed.
- Packet redaction errors.
- AI refusal and correction rates.
- User-reported harm from guidance.
- Privacy incidents.

---

## 17. Staffing And Ownership

### 17.1 Required functions

- Product lead for consumer advocacy.
- Backend engineer for case, rules, and data model.
- Frontend engineer for consumer workspace.
- Data engineer for source registry and price graph.
- Security/privacy engineer.
- Healthcare billing subject matter expert.
- Insurance and ERISA counsel.
- Debt/collections counsel.
- UX researcher.
- Advocate/resolver partnership lead.

### 17.2 Governance boards

- Product safety review.
- Counsel review.
- Data quality review.
- Public accountability methodology review.
- Resolver trust and safety review.

### 17.3 Launch roles

- Case operations owner.
- Source freshness owner.
- Incident commander.
- Privacy request owner.
- Resolver onboarding owner.
- Public methodology owner.

---

## 18. Major Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Over-attributing harm to plans | Legal, trust, consumer harm | Evidence ladder, confidence labels, counsel review, correction workflow |
| PHI leak through public dashboards | Severe privacy harm | Separate public tables, thresholding, redaction, privacy review |
| AI invents advice | Consumer harm | Deterministic findings, citations, refusals, no AI-only findings |
| Incorrect complaint route | Missed deadlines or wrong agency | Counsel-reviewed route rules, "possible routes" copy, user review |
| Poor plan identity match | Wrong attribution | Manual confirmation, confidence score, source evidence, unknown state |
| Resolver misuse | Privacy and trust harm | Verification, consent scopes, audit, revocation |
| Source data staleness | Wrong estimates | Source registry, freshness badges, stale-data warnings |
| Legal advice boundary | Regulatory and consumer harm | Counsel-reviewed copy, disclaimers, templates, no outcome guarantees |
| Public scorecard bias | Reputational and policy risk | Methodology page, caveats, denominators, thresholds, correction process |
| Upload before valid release | Privacy, compliance, and trust risk | Signed HIPAA authorization / medical record release gate, API rejection, expiration and revocation checks |
| Upload malware or prompt injection | Security and AI risk | Scanning, quarantine, extraction isolation, prompt filtering |

---

## 19. Concrete Next Engineering Tickets

### Ticket 1 - Consumer current-state doc

Create `docs/current-state-consumer.md` with:

- Routes.
- API modules.
- Data assets.
- Leverage engine status.
- Existing tests.
- Gaps.
- Build/test commands.

### Ticket 2 - Consumer case schema

Create `server/lib/consumer-migrate.js` and call it from `server/lib/db-migrate.js`.

Minimum tables:

- `con_cases`
- `con_case_events`
- `con_case_outcomes`
- `con_consent_grants`
- `con_medical_record_releases`
- `con_audit_events`

### Ticket 2A - HIPAA authorization / medical record release gate

Create the release service before document upload exists.

Minimum implementation:

- Versioned counsel-reviewed release template.
- `GET /api/cases/:caseId/medical-record-release`
- `POST /api/cases/:caseId/medical-record-release`
- `POST /api/cases/:caseId/medical-record-release/revoke`
- `requireActiveMedicalRecordRelease(userId, caseId)` helper.
- `medical_record_release_required` error code.

Tests:

- upload-gate helper returns false without release.
- signed active release allows upload helper to pass.
- expired release blocks upload helper.
- revoked release blocks upload helper.
- representative signature requires authority description.

### Ticket 3 - Consumer case API

Create `server/routes/consumer-cases.js`.

Minimum endpoints:

- `GET /api/cases`
- `POST /api/cases`
- `GET /api/cases/:caseId`
- `PATCH /api/cases/:caseId`

Tests:

- create own case
- list own cases
- reject other user's case
- audit read/write

### Ticket 4 - Consumer workspace UI

Create:

- `client/src/views/ConsumerHome.jsx`
- `client/src/views/MyCases.jsx`
- `client/src/views/CaseDetail.jsx`

Update:

- `client/src/App.jsx`
- `client/src/components/AppShell.jsx`

### Ticket 5 - Plan coverage profile schema

Create `server/lib/plan-migrate.js`.

Minimum tables:

- `plan_coverage_profiles`
- `plan_benefit_promises`
- `plan_network_evidence`
- `plan_outcome_attributions`

### Ticket 6 - Plan coverage UI

Create:

- `CoverageProfileEditor`
- `CoverageIdentityCard`
- `CoverageConfidenceBadge`

Add to:

- case intake
- case detail
- settings/profile area

### Ticket 7 - Outcome attribution service

Create:

- `server/plan/outcomeAttribution.js`
- tests for EOB mismatch, denial, directory mismatch, and collection notice.

Rules:

- Never make plan-caused claim from user testimony alone.
- Separate plan, provider, collector, employer, PBM, and unknown.
- Always include evidence refs.

### Ticket 8 - Bill-check API wiring

Connect `con_cases` to `lev_cases`.

Add:

- manual claim entry
- line item entry
- analyze endpoint
- findings read endpoint

### Ticket 9 - Bill-check UI

Create:

- `CheckBillIntake`
- `BillLineItemEditor`
- `BillAnalysisReport`
- `EvidenceRefsList`

### Ticket 10 - Complaint route seed

Create seed file for federal and general routes:

- CMS No Surprises.
- CFPB.
- NAIC/state DOI directory.
- HHS OCR.
- DOL EBSA.
- Provider/facility billing office.
- Insurer appeals.
- Employer benefits.

---

## 20. Launch Gate Checklist

Do not launch to real consumers until:

- Case ownership tests pass.
- Consent ledger exists.
- Signed HIPAA authorization / medical record release gate exists before document upload.
- Upload API rejects missing, expired, or revoked releases.
- Audit log exists.
- Document storage policy exists.
- PHI log redaction is tested.
- Consumer truth contract is published.
- Counsel has reviewed patient-facing legal/debt/insurance copy.
- Plan attribution uses confidence and unknown states.
- Public scorecards are disabled or thresholded.
- Deletion/export paths exist.
- Incident-response runbook exists.
- A human review path exists for high-risk cases.

---

## 21. Definition Of Done For The Ambition

MediCosts becomes a national patient-advocacy standard when it can do all of the following:

1. Give consumers source-backed medical cost estimates before care.
2. Check bills and EOBs for deterministic, evidence-backed issues.
3. Help users produce packets that advocates and institutions can act on.
4. Route complaints to appropriate channels with source-backed rationale.
5. Track case outcomes and resolution evidence.
6. Tie outcomes to insurance company, plan, product, network, and benefit promises when evidence supports it.
7. Publish de-identified accountability signals without exposing patients.
8. Help consumers choose plans using expected cost, provider fit, drug fit, quality, and accountability evidence.
9. Give resolvers a secure way to help.
10. Keep every claim auditable, correctable, and safe.

---

## 22. Recommended Immediate Next Step

Start with the smallest useful vertical slice:

1. Consumer case schema and API.
2. Coverage profile schema.
3. Manual bill/EOB entry.
4. Existing leverage-engine analysis.
5. Plan outcome attribution draft for EOB mismatch.
6. Evidence-backed packet download.

This slice proves the core loop:

**case -> evidence -> deterministic finding -> plan/outcome attribution -> packet -> tracked outcome**

Once that loop works, every later source, complaint route, resolver integration, public scorecard, and AI assistant feature becomes an extension of the same evidence system rather than a separate product.

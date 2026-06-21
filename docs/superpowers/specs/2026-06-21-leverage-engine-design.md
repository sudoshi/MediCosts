# Design Spec — Medical Debt Leverage Engine (Slice 1: Intake + Leverage Engine)

**Date:** 2026-06-21
**Status:** Approved design — proceeding to implementation plan
**Author:** Sanjay Udoshi, MD (with Claude)
**Branch context:** `modernize/m2-typescript-begin`

> ⚠️ **Legal disclaimer for this document:** Statute names, thresholds, and remedy
> characterizations below are working assumptions to scope software, **not legal
> advice**. Every item marked ⚠️ MUST be verified by licensed counsel before launch.
> Nothing here should ship to patients as legal advice.

---

## 1. Context & Strategic Framing

### 1.1 The pivot
MediCosts today is a read-only Medicare/CMS **transparency analytics** platform
(Express + PostgreSQL + React 19, partial TypeScript migration, JWT auth, the
"Abby" Anthropic-SDK AI copilot, and a `clearnetwork/` crawler that already
collects insurer machine-readable price files (MRFs) per state).

The new direction: let any U.S. individual submit the details of their **medical
debt** and pursue relief through a marketplace where **bar-verified attorneys**
compete in a **reverse auction** to take the case, each guaranteeing the
**highest net benefit to the patient**. Attorneys are paid primarily through
**fee-shifting / statutory-damages** statutes (the defendant pays), so the
patient ideally nets the debt eliminated with little or no out-of-pocket cost.
The **platform** earns revenue from **attorney/firm SaaS subscriptions** — never
from splitting legal fees.

### 1.2 Decisions locked during brainstorming
| Decision | Choice | Rationale |
|---|---|---|
| Core transaction model | **Champion-the-patient** (advocacy/claims), not buy-the-receivable | Patient owes the receivable; they don't own it. Cleanest defensible model matching the "sue and profit" intent. |
| Who may bid | **Licensed attorneys / law firms only** | Cleanest Unauthorized-Practice-of-Law (UPL) posture; enables actual litigation; platform stays a neutral marketplace. |
| Auction bid variable | **Highest guaranteed net to patient** | Leverages fee-shifting statutes (NSA, FDCPA, state UDAP, ERISA §502(g)) so the defendant pays the attorney. |
| Platform revenue | **Attorney SaaS subscription** | Survives ABA Model Rule 5.4 (no fee-splitting) and Rule 7.2 (referral limits). It's software, not a fee share. |
| First slice to build | **Intake + Leverage Engine** | Ships standalone value ("is my bill wrong?"), de-risks the moat, and is a prerequisite for the marketplace. |
| Finding-generation approach | **Hybrid (Approach C)**: LLM extracts, deterministic engine judges, LLM narrates | Only approach that yields both defensible evidence and good UX. |

### 1.3 Full platform decomposition (this spec covers slice 1 only)
1. **Debt Intake + Evidence Vault** — *this slice*
2. **Leverage Discovery Engine** — *this slice*
3. **Attorney Marketplace + Auction** — slice 2 (out of scope here; seam defined)
4. **Compliance & Audit layer** — cross-cutting (foundational pieces built here)

---

## 2. Scope of Slice 1

**In scope:** patient debt intake, encrypted document vault, LLM document
extraction with human-review fallback, a deterministic leverage rule engine over
the existing CMS/MRF warehouse, an explainable patient-facing leverage report,
and a PHI-safe de-identified case projection that the future marketplace will
consume.

**Out of scope (YAGNI for slice 1):** the auction/bidding engine, attorney
onboarding / bar verification, SaaS subscriptions & billing, payment rails,
cross-case analytics, and the separate data-analytics revenue product.

---

## 3. Architecture & Boundaries

The slice is a **new bounded module inside the existing app**, written in
**TypeScript** (the repo is mid-migration; no new `.js` is added). It reuses the
warehouse and Abby's Anthropic plumbing but stays isolated so it cannot
destabilize the current read-only analytics product.

### 3.1 Backend surface — `server/leverage/`
Four internal units with clean seams:
- `intake/` — case + document capture, consent, encrypted upload handling
- `extract/` — Claude-vision document → structured fields (confidence + human-review fallback)
- `judge/` — **deterministic** rules + benchmark engine (no LLM). Pure functions: `(extractedClaim, benchmarks) → Finding[]`
- `narrate/` — Claude turns `Finding[]` into the human-readable packet; constrained to findings, never invents

Plus:
- `server/routes/cases.ts` — patient-facing REST (create case, upload doc, get analysis)
- Read-only benchmark views over `medicare_inpatient`, the MRF/ClearNetwork tables, and new `ref_*` reference tables. **The engine never writes to analytics tables.**

### 3.2 Frontend surface (`client/src/views/`, existing CSS-modules + `useApi` patterns)
- `CaseIntake.jsx` — guided debt-submission wizard
- `CaseAnalysis.jsx` — leverage report (overcharge benchmark chart reuses existing Recharts wrappers)
- `MyCases.jsx` — patient case list

### 3.3 The boundary rule that makes output defensible
`judge` is the **only** unit that creates Findings. It is deterministic,
network/LLM-free, and unit-tested in isolation. Every Finding carries
`{ruleId, severity, evidenceRefs[], statuteCitation, feeShiftingEligible,
remedyType, benchmarkSnapshot}`. The LLM units (`extract`, `narrate`) can **never**
assert a violation — they only feed and phrase.

---

## 4. Data Model

All tables live in the existing **`medicosts`** schema with a **`lev_`** prefix
(reference tables use `ref_`). Isolation is by prefix + a dedicated authorization
layer, not a separate schema (per decision).

| Table | Purpose / key columns |
|---|---|
| `lev_cases` | one per submitted debt: `id, user_id, status, debt_total, provider_name, facility_ccn, service_date, insurance_status (insured/uninsured/self_pay), state, created_at` |
| `lev_case_documents` | `id, case_id, doc_type (bill/itemized/eob/collection_letter), storage_key, sha256, ocr_status, phi_present` |
| `lev_extracted_claims` | header fields + `extraction_confidence, review_status (auto/needs_review/verified)` |
| `lev_extracted_line_items` | `cpt_hcpcs, revenue_code, ms_drg, modifier, units, billed_amount, allowed_amount, plan_paid, patient_resp` |
| `lev_findings` | `case_id, rule_id, severity, title, statute_citation, fee_shifting_eligible, remedy_type, estimated_recovery_low, estimated_recovery_high, evidence_refs (jsonb), benchmark_snapshot (jsonb)` |
| `lev_case_scores` | `case_id, leverage_score (0–100), strongest_remedy, total_estimated_overcharge, marketplace_ready (bool)` |
| `ref_ncci_edits` | CMS NCCI procedure-to-procedure (PTP) edit pairs + MUE unit limits, versioned by `effective_year` |
| `ref_cms_fee_schedule` | CPT/HCPCS → Physician Fee Schedule allowable, versioned by `effective_year` |
| `ref_drg_base_rate` | MS-DRG → base rate, versioned by `effective_year` |

**Frozen benchmark rule:** `lev_findings.benchmark_snapshot` stores the exact
Medicare/MRF rate a finding was computed against, **frozen at analysis time**, so
the evidence reproduces even after CMS rates change. This is the auditability
requirement made concrete.

**Document storage:** raw files are encrypted at rest (AES-256-GCM via existing
`server/lib/crypto.js`) and stored **outside** Postgres; the DB holds only
`storage_key + sha256 + doc_type`.

---

## 5. Leverage Rule Catalog (the moat)

The deterministic `judge` engine's rule set. Each rule is a pure function over an
extracted claim + frozen benchmarks, emitting a Finding. The catalog is
**data-driven** (a versioned rule registry + `ref_*` tables), so adding a state
statute is a config row, not a redeploy. ⚠️ = statute/threshold that **must be
counsel-verified before launch**.

| Rule ID | Detects | Signal | Remedy / fee-shifting |
|---|---|---|---|
| `OVERCHARGE_MEDICARE_MULTIPLE` | Charge outlier vs Medicare allowable | `billed_amount` ÷ `ref_cms_fee_schedule` or `ref_drg_base_rate` > threshold (≈3–5×) | Negotiation leverage; foundational evidence |
| `OVERCHARGE_VS_MRF` | Charged above insurer's own negotiated rate | `billed_amount`/`patient_resp` vs ClearNetwork/MRF negotiated rate for code+payer | Strong negotiation; potential UDAP angle |
| `NSA_BALANCE_BILL_EMERGENCY` ⚠️ | Balance-billed for emergency / OON-at-INN-facility | EOB: OON + emergency place-of-service, `patient_resp` > in-network cost-share | NSA protection; enforcement mainly CMS/state — **private right of action limited; verify** |
| `NSA_GFE_OVERAGE` ⚠️ | Uninsured/self-pay billed ≥ $400 over Good Faith Estimate | self_pay + final bill − GFE ≥ $400 | Patient-Provider Dispute Resolution path |
| `HOSP_501R_AGB` ⚠️ | Nonprofit hospital billed uninsured above Amounts Generally Billed | `facility_ccn` → nonprofit; billed > AGB ceiling | 501(r) violation; charity-care eligibility |
| `ECA_BEFORE_FAP` ⚠️ | Collection action before financial-assistance screening | collection_letter present + no FAP determination | 501(r) Extraordinary Collection Action bar |
| `NCCI_UNBUNDLING` | Codes that must be bundled billed separately | code pair in `ref_ncci_edits` PTP table without valid modifier | Billing-error dispute; reduces balance |
| `MUE_UNIT_EXCESS` | Impossible unit count | `units` > MUE max for HCPCS | Billing-error dispute |
| `DUPLICATE_LINE` | Same code/date/units billed twice | exact/near-duplicate line detection | Billing-error dispute |
| `EOB_PATIENT_RESP_MISMATCH` | Bill exceeds EOB patient-responsibility | itemized `patient_resp` total > EOB adjudicated patient_resp | Strong: provider billing above adjudicated amount |
| `FDCPA_FCRA_FLAG` ⚠️ | Collection / credit-reporting violation signals | collection_letter timing; sub-$500 medical tradeline; paid-but-reported | FDCPA $1k statutory + FCRA; **fee-shifting eligible** |
| `ERISA_DENIAL` ⚠️ | Employer-plan wrongful denial | EOB denial code + ERISA (employer) plan | §502(a) claim; §502(g) **attorney-fee shifting**; state claims preempted |

**Leverage score** = weighted rollup emphasizing `fee_shifting_eligible` +
`estimated_recovery` + evidence strength. A case is `marketplace_ready` when ≥1
finding is high-severity **and** the extraction is `verified`. The score is
explainable: it is the sum of its findings, each clickable to its evidence.

---

## 6. Pipeline (extract → judge → narrate)

```
Patient submits case + uploads
        │
   [intake]  validate, store encrypted, hash, mark PHI
        │
   [extract] Claude vision → structured fields + confidence
        │        └─ low confidence → needs_review queue (human verifies)
        │
   [judge]   DETERMINISTIC: run rule catalog vs frozen benchmarks
        │        └─ emit Findings + benchmark_snapshot + case_score
        │
   [narrate] Claude writes patient-facing packet FROM findings only
        │
   Patient sees leverage report  ──►  (later) marketplace listing
```

- **Async + idempotent:** each stage writes its output and is independently
  re-runnable (reuse the `abby_messages`-style job pattern). Re-running with the
  same inputs reproduces the same findings — required for evidence.
- **Extraction is the only failure-prone step**, so it is gated: nothing reaches
  `judge` as `verified` until confidence clears threshold or a human confirms.
  Patients see a "needs a quick review" state rather than a wrong number.
- **`judge` makes zero network/LLM calls** — pure TypeScript, exhaustively
  unit-tested with fixture bills. Correctness lives here.

---

## 7. Intake UX & PHI / Security Posture

### 7.1 Patient journey (`CaseIntake.jsx` wizard)
1. Consent + disclaimers gate (§9) — must accept before anything is stored
2. Debt basics — provider, service date, total owed, insured/uninsured/self-pay, state
3. Document upload — bill, itemized statement, EOB, collection letters (PDF or photo)
4. "Analyzing…" async state → leverage report (`CaseAnalysis.jsx`)

### 7.2 PHI / security posture (highest-risk surface)
- **Legal status:** the platform is almost certainly *not* a HIPAA covered entity
  or business associate — patients voluntarily submit their *own* records — but
  the data is treated as PHI-grade regardless. ⚠️ Confirm with counsel; any future
  provider/insurer integration changes the BAA analysis.
- **Encryption:** raw documents encrypted at rest (AES-256-GCM, existing
  `crypto.js`), stored outside Postgres; DB holds only `storage_key + sha256 +
  doc_type`. TLS in transit (already enforced).
- **Access control:** new `requireCaseOwner(caseId)` authorization layer atop the
  existing JWT `requireAuth`; a user may read only their own `lev_*` rows.
  Admin/ops access is role-gated and audit-logged.
- **De-identification boundary:** the future marketplace only ever sees a
  de-identified projection (findings, scores, code-level overcharges, state, debt
  bands) — **never** name, MRN, exact dates, provider identity, or raw documents.
  Identity reveals to exactly one attorney only after the patient accepts a bid.
  The projection is built **now** so PHI segregation is baked in from line one.
- **Retention/erasure:** soft-delete + hard-purge path for documents on request.

---

## 8. Seam to the Attorney Marketplace (slice 2)

Not built in this slice, but the interface is defined so slice 2 plugs in without
rework:
- `lev_case_scores.marketplace_ready` is the gate.
- A read-only **`lev_case_public_view`** projection exposes only de-identified
  fields: `case_id, state, debt_band, leverage_score, finding_types[],
  strongest_remedy, fee_shifting_eligible, estimated_recovery_band`. This is the
  **only** thing the future marketplace queries — enforced at the DB-view level so
  PHI cannot leak by accident.
- A stubbed `MarketplaceGateway` interface (`publishCase(caseId)`,
  `revealIdentity(caseId, attorneyId)`) — no-op now, real in slice 2 — keeps the
  engine decoupled from auction mechanics.

---

## 9. Compliance Guardrails

- **No legal advice from the platform.** `narrate` output is framed as factual
  findings + potential issues, never "you should sue" / "you will win." Persistent
  disclaimer + a reviewed copy-deck. ⚠️ Counsel signs off on all patient-facing
  language.
- **Rule 5.4 / 7.2 firewall:** revenue is attorney SaaS subscriptions only. The
  engine records **no** linkage between platform revenue and case outcomes; no
  contingency data flows to platform billing. Designed so there is no fee-split to
  find.
- **Audit trail:** every finding, extraction, and access is append-only logged
  with the frozen `benchmark_snapshot` — reproducible months later.
- **Per-state config:** the rule catalog is state-aware (`lev_cases.state` scopes
  which ⚠️ rules fire), enabling a pilot-state launch with config-driven expansion.

---

## 10. Testing Strategy

Per the 80% coverage bar; `judge` gets the heaviest coverage.
- **`judge` unit tests** against a fixture library of real-shape bills/EOBs —
  every rule has positive + negative + boundary fixtures. The correctness core.
- **`extract` evaluation** against a labeled document set (precision/recall on
  field extraction); regression-tracked.
- **Integration tests:** full intake→report pipeline on seeded cases.
- **E2E:** patient submits a known-overcharge bill → sees expected findings.

---

## 11. Success Criteria (slice 1)

1. A patient can submit a debt + documents and receive an explainable leverage report.
2. Every finding traces to a rule + frozen benchmark row (zero unsourced claims).
3. `judge` is deterministic and ≥80% covered with fixtures.
4. The de-identified `lev_case_public_view` exists and contains zero PHI.
5. No LLM output ever asserts a violation the deterministic engine did not produce.

---

## 12. Open Items Requiring Counsel / Verification Before Build-Complete

- [ ] NSA private-right-of-action scope and the $400 GFE dispute threshold (current law)
- [ ] 501(r) AGB calculation method + Extraordinary Collection Action timing rules
- [ ] FDCPA/FCRA current medical-debt credit-reporting rules (2024–2026 CFPB rulemaking status)
- [ ] State UDAP / surprise-billing statutes for the chosen pilot state(s)
- [ ] ERISA §502 claim viability and preemption boundaries
- [ ] HIPAA covered-entity / business-associate determination for the platform
- [ ] All patient-facing copy reviewed to ensure it is not legal advice
- [ ] Rule 5.4 / 7.2 structure reviewed against pilot-state bar opinions

> The brainstorming research agents (legal taxonomy, document extraction, prior
> art) hit session limits and did not return; targeted web research should be run
> during planning to populate citations for the items above.

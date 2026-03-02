# MediCosts — Final Version Plan
**Version Target: 1.0 Production**
**Date:** 2026-03-02
**Current State:** v0.4 alpha — deployed at `https://medicosts.acumenus.net`

---

## Executive Summary

MediCosts has evolved from a single-dataset Medicare inpatient pricing dashboard into a comprehensive healthcare transparency platform. The mission: expose why US healthcare costs are out of control, arm consumers with the data to make better decisions, and surface the best and worst performers with no ambiguity.

This document is a complete prompt for Claude Code to build the final 1.0 version — hardening what exists, filling the gaps, and delivering a polished, consumer-grade product.

---

## Current State: What Has Been Built

### Infrastructure
- **Frontend:** React 19 + Vite, 45 views/components, React Router, Recharts, CSS Modules
- **Backend:** Node.js + Express, 7 route files, 55+ API endpoints
- **Database:** PostgreSQL (`medicosts` schema) on pgsql.acumenus.net
- **AI Assistant:** Abby — Ollama/MedGemma, 54 tools, SSE streaming, localStorage persistence
- **Deployment:** Apache reverse proxy + Let's Encrypt SSL + systemd user service on `medicosts.acumenus.net`
- **Design System:** Apple/Linear-inspired dark mode — Inter + JetBrains Mono, `#0c0c0e` base

### Data (Production `medicosts` Schema)
| Table | Rows | Source |
|-------|------|--------|
| `medicare_inpatient` | 146,427 | CMS 2023 inpatient DRG pricing |
| `medicare_inpatient_historical` | 1,985,253 | CMS 2013–2023 (11 years) |
| `hospital_info` | ~6,000 | CMS hospital general info |
| `hospital_quality` | ~200,000 | HAI SIRs, PSI, mortality, HAC |
| `hospital_spending_by_claim` | 63,646 | Episode spending by claim type |
| `unplanned_hospital_visits` | 67,046 | Readmissions, EDAC measures |
| `hospital_vbp` | 2,455 | Value-based purchasing (5 domains) |
| `spending_per_beneficiary` | 4,625 | MSPB-1 ratios |
| `hcahps` | ~175,000 | Patient satisfaction (10 dimensions) |
| `nursing_home_info` | 14,710 | CMS nursing home profiles |
| `nursing_home_quality` | 250,070 | MDS quality measures |
| `home_health_agencies` | 12,251 | Home health outcomes |
| `hospice_providers` | 465,181 | Hospice quality scores |
| `dialysis_facilities` | 7,557 | ESRD quality rates |
| `clinician_directory` | 2,686,173 | 2.7M NPIs with affiliations |
| `irf_providers` | ~1,200 | Inpatient rehab facilities |
| `ltch_providers` | ~400 | Long-term care hospitals |
| `medical_suppliers` | ~7,000 | Equipment suppliers |
| `zip_centroids` | ~33,000 | ZIP lat/lon for haversine |
| Census ACS demographics | ~33,000 | Median income + population by ZIP |

**Staging schema** (`stage`): 271 tables, 117.6M rows, 36 GB — full raw data lake from 15+ federal agencies awaiting promotion.

### Materialized Views (14)
`mv_top50_drg`, `mv_zip_summary`, `mv_hcahps_summary`, `mv_physician_zip_summary`, `mv_hospital_composite_quality`, `mv_drg_yearly_trend`, `mv_state_yearly_trend`, `mv_provider_yearly_trend`, `mv_hospital_episode_cost`, `mv_hospital_value_composite`, `mv_post_acute_landscape`, `mv_outpatient_services`, `mv_state_quality_summary`, `mv_hac_summary`

### Frontend Pages (22 views)
| Route | Page | Status |
|-------|------|--------|
| `/overview` | Consumer Overview with ShockStats hero | ✅ |
| `/quality` | Quality Command Center (6 domains + VBP + HCAHPS) | ✅ |
| `/hospitals` | Hospital Explorer (searchable, filterable table) | ✅ |
| `/hospitals/:ccn` | Hospital Detail (full profile) | ✅ |
| `/geography` | Geographic Analysis (state map + ZIP proximity) | ✅ |
| `/trends` | 11-Year Cost Trends | ✅ |
| `/post-acute` | Post-Acute Care landscape | ✅ |
| `/nursing-homes/:ccn` | Nursing Home Detail | ✅ |
| `/dialysis/:ccn` | Dialysis Center Detail | ✅ |
| `/home-health/:ccn` | Home Health Agency Detail | ✅ |
| `/hospice/:ccn` | Hospice Provider Detail | ✅ |
| `/irf/:ccn` | Inpatient Rehab Detail | ✅ |
| `/ltch/:ccn` | Long-Term Care Hospital Detail | ✅ |
| `/spending` | Spending & Value composite | ✅ |
| `/clinicians` | Clinician Directory (2.7M NPIs) | ✅ |
| `/clinicians/:npi` | Clinician Profile | ✅ |
| `/physicians` | Physician Analytics (HCPCS codes) | ✅ |
| `/accountability` | Name & Shame — price gouging, penalties | ✅ |
| `/compare` | Side-by-side Hospital Comparison (3 hospitals) | ✅ |
| `/estimate` | Cost Estimator — "Kayak for procedures" | ✅ |
| `/for-patients` | Patient Intake + Abby handoff | ✅ |
| `/abby` | Abby AI Analytics assistant | ✅ |
| `/connectors` | Data source connectors UI | ✅ |
| `/settings` | Settings + version display | ✅ |

---

## Vision for 1.0

> MediCosts 1.0 is the most comprehensive, honest, and actionable public window into US healthcare costs and quality. It names names, shows prices, grades performance, and guides patients to better decisions — all from legally mandated public data that insurers and hospitals are required to publish but hope consumers never find.

### Three Pillars for 1.0

1. **Complete the data lake** — Promote high-value staged data into typed `medicosts` tables, wire it to the API, and surface it in the UI. Specifically: CMS Open Payments (pharma money), HCRIS Cost Reports (hospital financials), HRSA shortage areas, CDC PLACES (community health), CMS Part D (drug pricing).

2. **Polish the consumer experience** — Make every page production-quality: loading states, empty states, error handling, mobile responsiveness, print stylesheets. Add sharing, bookmarking, and embeddability.

3. **Close the known gaps** — Abby's tool coverage, outpatient cost pages, the data connectors view, missing detail pages, performance (query caching), and security hardening.

---

## Phase 1 — Data Lake Promotions (High Priority)

These datasets are sitting in `stage.*` with 117M+ rows. Promoting them unlocks entirely new analytics dimensions.

### 1.1 CMS Open Payments — Pharma Money to Physicians
**Source:** `stage.open_payments__*` (~30M rows, PY2023 + PY2024)
**Why:** Exposes which doctors receive the most pharma/device payments — and correlates with prescribing patterns and procedure rates.

**Target table:** `medicosts.open_payments`
```sql
CREATE TABLE medicosts.open_payments (
  id BIGSERIAL PRIMARY KEY,
  payment_year SMALLINT,
  physician_npi VARCHAR(10),
  physician_name TEXT,
  physician_specialty TEXT,
  institution_name TEXT,           -- for teaching payments
  payer_name TEXT,                 -- drug/device company name
  payment_type VARCHAR(50),        -- 'General Payment', 'Research', 'Ownership'
  payment_amount NUMERIC(14,2),
  payment_date DATE,
  payment_nature TEXT,             -- 'Food and Beverage', 'Travel', 'Consulting Fee', etc.
  drug_device_name TEXT,           -- what they were paid to promote
  state CHAR(2),
  city TEXT
);
CREATE INDEX ON medicosts.open_payments(physician_npi);
CREATE INDEX ON medicosts.open_payments(payer_name);
CREATE INDEX ON medicosts.open_payments(state, payment_year);
```

**Materialized view:** `mv_physician_payments` — top-paid physicians by NPI with total amounts, top payers, top drugs
**API endpoints to add:**
- `GET /api/payments/physician/:npi` — payments received by a clinician (joins with clinician_directory)
- `GET /api/payments/top?state=&year=&limit=` — top-paid physicians by state/year
- `GET /api/payments/by-company?name=&year=` — all payments from a pharma company
- `GET /api/payments/hospital/:ccn` — payments to physicians affiliated with a hospital

**Frontend:**
- Add "Industry Payments" tab to `HospitalDetail.jsx` and `ClinicianProfile.jsx`
- New `/accountability` section: "Pharmaceutical Influence" with top-paid physicians table
- Add payments badge to clinician search results

---

### 1.2 HCRIS Hospital Cost Reports — Financial Transparency
**Source:** `stage.cms_cost_reports__*` (~45.6M rows, 6 tables, FY2023+FY2024)
**Why:** These are the actual financial statements hospitals file with CMS. Contains operating margins, cost-to-charge ratios, uncompensated care, bed counts, staffing ratios — the real financial picture behind the billing.

**Target tables:**
```sql
CREATE TABLE medicosts.hospital_financials (
  ccn VARCHAR(10) PRIMARY KEY,
  fiscal_year SMALLINT,
  total_beds INTEGER,
  staffed_beds INTEGER,
  total_discharges INTEGER,
  total_charges NUMERIC(18,2),
  total_costs NUMERIC(18,2),
  operating_margin NUMERIC(8,4),      -- (revenue - costs) / revenue
  cost_to_charge_ratio NUMERIC(8,4),  -- total_costs / total_charges
  uncompensated_care NUMERIC(18,2),   -- charity + bad debt
  total_revenue NUMERIC(18,2),
  medicare_revenue NUMERIC(18,2),
  medicaid_revenue NUMERIC(18,2),
  rn_hours_per_patient_day NUMERIC(8,4),
  total_fte NUMERIC(10,2),
  teaching_status VARCHAR(20),        -- 'major', 'minor', 'non-teaching'
  ownership_type VARCHAR(30)          -- 'non-profit', 'for-profit', 'government'
);
```

**Materialized view:** `mv_hospital_financial_profile` — joins financials with quality composite + inpatient cost
**API endpoints:**
- `GET /api/financials/:ccn` — hospital financial profile
- `GET /api/financials/rankings?state=&metric=operating_margin&limit=` — most/least profitable hospitals
- `GET /api/financials/compare?ccn1=&ccn2=` — financial side-by-side

**Frontend:**
- New "Financials" tab in `HospitalDetail.jsx`: operating margin, cost-to-charge, uncompensated care, staffing
- New section in `AccountabilityDashboard.jsx`: "Most Profitable Hospitals vs. Uncompensated Care"
- Financial sparklines in `HospitalCompare.jsx`

---

### 1.3 HRSA Health Professional Shortage Areas
**Source:** `stage.hrsa_hpsas__*`
**Why:** Shows which communities lack adequate primary care, mental health, or dental providers — critical context for geographic analysis.

**Target table:**
```sql
CREATE TABLE medicosts.hrsa_shortage_areas (
  hpsa_id VARCHAR(20) PRIMARY KEY,
  shortage_type VARCHAR(30),   -- 'Primary Care', 'Dental Health', 'Mental Health'
  designation_type VARCHAR(40),
  state CHAR(2),
  county TEXT,
  zip5 VARCHAR(5),
  hpsa_score SMALLINT,         -- 0-25, higher = more severe shortage
  hpsa_status VARCHAR(20),     -- 'Designated', 'Proposed Withdrawal', etc.
  population_served INTEGER,
  ftes_needed NUMERIC(8,2),    -- clinicians needed to remove shortage
  designation_date DATE
);
CREATE INDEX ON medicosts.hrsa_shortage_areas(zip5);
CREATE INDEX ON medicosts.hrsa_shortage_areas(state, shortage_type);
```

**API endpoints:**
- `GET /api/shortage-areas?zip=&radius=` — shortage area designations near a ZIP
- `GET /api/shortage-areas/state/:state` — shortage summary by state

**Frontend:**
- New layer toggle in `GeographicAnalysis.jsx`: "Shortage Areas" overlay on state map
- Warning badge in `CostEstimator.jsx` when selected area has shortage designation
- Shortage context card in `ClinicianDirectory.jsx` filtering panel

---

### 1.4 CDC PLACES — Community Health at ZIP Level
**Source:** `stage.cdc_places__places_zcta` (~33K ZCTAs × 36 health measures)
**Why:** Answers "what is the health burden of the community this hospital serves?" — enables rich contextual analysis between community health outcomes and hospital quality/utilization.

**Target table:**
```sql
CREATE TABLE medicosts.cdc_community_health (
  zip5 VARCHAR(5) PRIMARY KEY,
  year SMALLINT,
  -- Chronic disease (prevalence %)
  diabetes_pct NUMERIC(6,2),
  copd_pct NUMERIC(6,2),
  heart_disease_pct NUMERIC(6,2),
  stroke_pct NUMERIC(6,2),
  obesity_pct NUMERIC(6,2),
  asthma_pct NUMERIC(6,2),
  cancer_pct NUMERIC(6,2),
  kidney_disease_pct NUMERIC(6,2),
  -- Risk behaviors
  smoking_pct NUMERIC(6,2),
  binge_drinking_pct NUMERIC(6,2),
  physical_inactivity_pct NUMERIC(6,2),
  -- Mental health
  depression_pct NUMERIC(6,2),
  mental_distress_pct NUMERIC(6,2),
  -- Prevention/access
  uninsured_pct NUMERIC(6,2),
  checkup_pct NUMERIC(6,2),        -- had routine checkup
  dental_visit_pct NUMERIC(6,2)
);
```

**API endpoint:** `GET /api/community-health/:zip` — community health profile for a ZIP
**Frontend:**
- "Community Health Context" card in `HospitalDetail.jsx` (using hospital ZIP)
- New scatter plot in `SpendingValue.jsx`: community diabetes rate vs. hospital readmissions
- Context panel in `CostEstimator.jsx` search results

---

### 1.5 CMS Part D Drug Spending
**Source:** `stage.cms_part_d__*` (~14K rows drug-level spending)
**Why:** Shows which drugs Medicare spends the most on, average costs, and manufacturer rebates — direct evidence of drug pricing opacity.

**Target table + API:** `GET /api/drug-spending/top?limit=&class=`
**Frontend:** New sub-section in `PhysicianAnalytics.jsx` or new `/drugs` page

---

## Phase 2 — Frontend Polish & Production Hardening

### 2.1 Loading & Empty States (All Pages)
Every page must handle three states gracefully:
- **Loading:** Skeleton screens (not spinners) — show table/chart outlines with pulse animation
- **Empty:** Illustrated empty state with context ("No hospitals found in this state" + suggestion)
- **Error:** Friendly error card with retry button + error code for debugging

**Implementation pattern:**
```jsx
// Standardize this pattern across all 22 views:
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);
  return { data, loading, error };
}
```

Create `client/src/components/ui/Skeleton.jsx` and `EmptyState.jsx` shared components.

---

### 2.2 Mobile Responsiveness
The app is currently desktop-only. Target: fully usable on 390px (iPhone 15) and 768px (iPad).

**Key breakpoints:**
- Sidebar: collapse to bottom nav bar on mobile (≤768px)
- Data tables: horizontal scroll with sticky first column, or card view on mobile
- Charts: reduce to single-column stacks on mobile
- Hospital Detail: tab accordion instead of side-by-side panels on mobile

**Files requiring the most work:**
- `AppShell.jsx` / `AppShell.module.css` — mobile nav
- `HospitalDetail.jsx` — panel grid
- `HospitalCompare.jsx` — 3-column grid
- `AccountabilityDashboard.jsx` — wide tables
- `CostEstimator.jsx` — results table

---

### 2.3 Performance: Query Result Caching
Heavy API queries (state summaries, top-50 DRGs, composite quality) are re-run on every page load. Add server-side in-memory caching with TTL.

**Implementation:** Add a lightweight cache in `server/lib/cache.js`:
```js
const cache = new Map();
export function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = fn();
  cache.set(key, { data, at: Date.now() });
  return data;
}
```

Cache targets:
- `/api/drgs/top50` — TTL 1 hour
- `/api/stats` — TTL 30 min
- `/api/states/summary` — TTL 1 hour
- `/api/quality/accountability/summary` — TTL 1 hour
- All materialized view queries — TTL 30 min

Also: add `REFRESH MATERIALIZED VIEW CONCURRENTLY` to a nightly cron/systemd timer.

---

### 2.4 Data Connector View
`/connectors` (`DataConnectors.jsx`) is built but needs to show real-time data freshness for each source.

**Target state:** Each connector card shows:
- Source name + agency
- Last crawl timestamp (read from a `medicosts.data_sources` table)
- Row count
- Status badge: `current` / `stale` / `error`
- Manual refresh button (triggers re-download + reload for small sources)

**New table:**
```sql
CREATE TABLE medicosts.data_sources (
  source_id VARCHAR(50) PRIMARY KEY,
  source_name TEXT,
  agency TEXT,
  table_name TEXT,
  last_loaded TIMESTAMPTZ,
  row_count BIGINT,
  file_size_mb NUMERIC(10,2),
  download_url TEXT,
  update_frequency VARCHAR(20)   -- 'annual', 'quarterly', 'monthly'
);
```

---

### 2.5 Settings View — Real Configuration
`/settings` currently shows only a version number. Wire it to real configuration:
- **Abby model selector** — dropdown of available Ollama models (fetched from `/api/abby/health`)
- **Ollama URL override** — text field, saved to localStorage, used by frontend fetch calls
- **Data freshness** — table showing last update for each data domain
- **Theme toggle** — dark (default) / light mode prep (add `data-theme` attribute toggle)
- **Export** — "Download current view as CSV" button (generic, reads displayed table data)

---

### 2.6 Print & Share Improvements
`HospitalDetail.jsx` has a print button. Expand sharing across the app:
- **All detail pages:** "Print Report Card" button with `@media print` stylesheet
- **Hospital Compare:** "Copy Shareable Link" already exists — extend to Cost Estimator results
- **Cost Estimator:** Shareable URL with DRG + location params in querystring
- **Abby conversations:** "Export conversation as PDF" using browser print

---

## Phase 3 — New Feature: ClearNetwork Integration

`clearnetwork/` directory exists. The ClearNetwork concept (see `clearnetwork.md`) is the logical next evolution: insurance network verification using CMS-mandated Transparency in Coverage machine-readable files (MRFs).

### 3.1 Minimal ClearNetwork MVP (Phase 3a)
Do NOT attempt the full ClearNetwork build from `clearnetwork.md` — that is a multi-year infrastructure project. Instead, build a minimal, valuable integration within MediCosts:

**Goal:** Given a hospital or clinician, show which major insurance plans include them in-network — using the TOP 10 largest US insurers' MRF index files.

**Scope:**
- Index 10 insurers only: UnitedHealth, Anthem/BCBS, Aetna, Cigna, Humana, CVS/Aetna, Centene, Molina, Kaiser, Elevance
- Only check in-network status (not rates) for efficiency
- Cache results aggressively (MRFs don't change daily)

**New route file:** `server/routes/network.js`
```
GET /api/network/check?npi=&insurers=  — Is this NPI in-network for specified insurers?
GET /api/network/hospital/:ccn          — Network status for a hospital across major insurers
```

**Frontend:** "Insurance Networks" badge row on `HospitalDetail.jsx` and `ClinicianProfile.jsx` — green/grey chips for each insurer.

---

## Phase 4 — Abby AI: Upgrade & Expand

### 4.1 Upgrade to Claude API
Replace Ollama/MedGemma with Claude API (`claude-haiku-4-5-20251001` for cost, `claude-sonnet-4-6` for quality).

**Why:** MedGemma via Ollama requires local GPU, limits deployment options, has lower reasoning quality. Claude API is production-ready.

**Changes needed:**
- `server/routes/abby.js` — replace Ollama OpenAI-compat calls with `@anthropic-ai/sdk`
- `server/lib/abby-prompt.js` — adapt system prompt to Claude's format
- `.env` — add `ANTHROPIC_API_KEY`
- Tool calling: switch from prompt-based `tool_call` JSON block parsing to native Anthropic tool use API
- Keep SSE streaming (Claude API supports it via `stream: true`)

**Model routing:**
```js
// Use haiku for tool-heavy data lookups, sonnet for synthesis/explanation
const model = toolCallCount > 2 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6';
```

### 4.2 New Abby Tools for Phase 1 Data
After promoting new datasets, add tools:
- `get_physician_payments(npi, year)` — pharma payments to a doctor
- `get_hospital_financials(ccn)` — operating margin, cost-to-charge, staffing
- `get_community_health(zip)` — CDC PLACES health measures
- `get_shortage_areas(zip, radius)` — HRSA shortage designations
- `get_top_paying_companies(specialty, state)` — pharma rankings

### 4.3 Abby Conversation Memory (DB Persistence)
Currently conversations live in localStorage only. Add server-side persistence for returning users:

```sql
CREATE TABLE medicosts.abby_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0
);

CREATE TABLE medicosts.abby_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID REFERENCES medicosts.abby_sessions(session_id),
  role VARCHAR(20),     -- 'user' | 'assistant'
  content TEXT,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

New endpoints: `POST /api/abby/sessions`, `GET /api/abby/sessions/:id/messages`

---

## Phase 5 — New Pages

### 5.1 Drug Pricing Page (`/drugs`)
**Data source:** CMS Part D Spending + NADAC acquisition costs
**Key insight:** The delta between NADAC (what pharmacies pay) and Medicare reimbursement reveals where drug profits go.

**Page sections:**
- Top 25 most expensive drugs by Medicare spend
- Search by drug name with price history
- Manufacturer breakdown (who profits most)
- "Brand vs. Generic" price comparison

### 5.2 Physician Payments Page (`/payments`)
**Data source:** CMS Open Payments (Phase 1.1)
**Key insight:** Some doctors receive millions from pharma companies while prescribing those companies' drugs.

**Page sections:**
- Top-paid physicians nationally (searchable)
- Top pharma companies by payment amount
- Payment breakdown by nature (consulting, meals, travel, research)
- "Does this doctor have payments?" lookup by NPI

### 5.3 Hospital Financials Page (`/financials`)
**Data source:** HCRIS Cost Reports (Phase 1.2)
**Key insight:** Many hospitals claiming financial hardship have operating margins exceeding 15%.

**Page sections:**
- Operating margin distribution (histogram)
- Least/most profitable hospitals by state
- Uncompensated care vs. reported profits
- Cost-to-charge ratio table (who marks up the most)

---

## Phase 6 — Technical Debt & Security

### 6.1 Authentication Hardening
Current login is client-side only (`useState(false)` → `useState(true)`). For production:
- Move auth to Express session middleware
- Use `express-session` + bcrypt for password checking against `.env` secret
- Add rate limiting to login endpoint (`express-rate-limit`)
- Add CSRF protection

### 6.2 SQL Injection Audit
All existing endpoints use parameterized queries (`$1`, `$2` etc.) — verify every route file follows this pattern. Never interpolate user input into SQL strings.

**Files to audit:** `server/routes/api.js`, `server/routes/quality.js`, `server/routes/facilities.js`, `server/routes/post-acute.js`, `server/routes/trends.js`, `server/routes/connectors.js`

### 6.3 API Rate Limiting
Add `express-rate-limit` to all routes:
```js
import rateLimit from 'express-rate-limit';
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);
// Stricter limit on Abby (LLM inference is expensive)
const abbyLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use('/api/abby/', abbyLimiter);
```

### 6.4 Environment Variable Validation
Add startup validation in `server/index.js`:
```js
const required = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
required.forEach(k => { if (!process.env[k]) throw new Error(`Missing ${k}`); });
```

### 6.5 Error Logging
Replace `console.error` throughout with structured logging:
- Add `pino` logger to `server/lib/logger.js`
- Log all 500 errors with request context (path, query params, error message + stack)
- Log slow queries (>500ms) as warnings

---

## Phase 7 — Documentation & Launch

### 7.1 Public Landing Page
Replace the login gate with a public landing page at `/` that:
- Shows MediCosts mission + 3 key stats (national markup, penalized hospitals, data sources)
- Has "Explore the Data" CTA → login
- Is indexable by search engines (SEO meta tags)

### 7.2 About / Methodology Page
`/about` page explaining:
- All data sources, their provenance, and update schedules
- Methodology for composite scores, ranking calculations
- Data limitations and how to interpret results
- Legal: all data is publicly mandated CMS/federal data, no PHI

### 7.3 API Documentation
`/api-docs` — auto-generated from Express route comments using `swagger-jsdoc` + `swagger-ui-express`

### 7.4 README Update
Update `README.md` for 1.0:
- Quick start (Docker Compose option)
- Full data load walkthrough
- All available npm scripts
- Environment variable reference

---

## Implementation Priorities

Execute in this order:

| Priority | Phase | Est. Complexity | Impact |
|----------|-------|-----------------|--------|
| 🔴 1 | Phase 1.1 — Open Payments promotion | High | Unlock pharma transparency |
| 🔴 2 | Phase 1.2 — HCRIS Cost Reports | High | Hospital financial transparency |
| 🔴 3 | Phase 4.1 — Upgrade Abby to Claude API | Medium | Production AI quality |
| 🟡 4 | Phase 2.1 — Loading/empty states | Medium | UX polish |
| 🟡 5 | Phase 1.3 — HRSA shortage areas | Low | Enrich Geographic Analysis |
| 🟡 6 | Phase 1.4 — CDC PLACES | Medium | Community health context |
| 🟡 7 | Phase 5.2 — Physician Payments page | Medium | New consumer transparency page |
| 🟡 8 | Phase 5.3 — Hospital Financials page | Medium | New consumer transparency page |
| 🟢 9 | Phase 2.2 — Mobile responsiveness | High | Consumer accessibility |
| 🟢 10 | Phase 2.3 — Query caching | Low | Performance |
| 🟢 11 | Phase 6.1-6.5 — Security hardening | Medium | Production readiness |
| 🟢 12 | Phase 7 — Docs + landing page | Low | Launch readiness |

---

## Database Quick Reference

**Connection:** Uses env vars `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` loaded from project root `.env`

**Production schema:** `medicosts`
**Staging schema:** `stage`

**Key joins:**
- Hospital inpatient + quality: `medicare_inpatient.provider_ccn = hospital_quality.facility_id`
- Hospital info + quality: `hospital_info.facility_id = hospital_quality.facility_id`
- Clinician + payments: `clinician_directory.npi = open_payments.physician_npi`
- ZIP distance: `zip_centroids.zip5` + haversine formula

**CMS safe-cast pattern** (always use for numeric fields from CMS source data):
```sql
CASE WHEN col ~ '^\-?[0-9]+\.?[0-9]*$' THEN col::NUMERIC ELSE NULL END
```

**Redeploy workflow:**
```bash
cd ~/Github/MediCosts/client && node ./node_modules/vite/bin/vite.js build
systemctl --user restart medicosts
```

---

## Success Criteria for 1.0

- ✅ Open Payments data visible on clinician profiles and in new Payments page
- ✅ Hospital financial data (margins, cost-to-charge) visible on hospital detail
- ✅ Abby running on Claude API with native tool use
- ✅ All pages have proper loading/empty/error states
- ✅ Mobile-usable at 390px (core flows: lookup a hospital, estimate a procedure cost)
- ✅ All API queries use parameterized statements (no SQL injection vectors)
- ✅ No console errors on any page
- ✅ p95 API response time < 300ms (aided by caching)
- ✅ Public landing page replacing login gate
- ✅ About/methodology page explaining data sources

---

*MediCosts 1.0 — Because the truth about healthcare costs should not be hidden behind 100GB insurance company data dumps that only machines can read.*

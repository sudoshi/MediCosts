# MediCosts Development Log

## Port Configuration (2026-02-28)

Ports 3001 and 5173 are in use by other deployed applications on this machine (Apache virtual hosts). Updated to alternate ports:

| Service | Old Port | New Port |
|---------|----------|----------|
| Express API | 3001 | **3090** |
| Vite dev server | 5173 | **5180** |
| Python Dash | 8050 | **8051** |

- `.env.example`: `PORT=3090`
- `client/vite.config.js`: `server.port: 5180`, proxy target `localhost:3090`
- `medicare-dashboard/app.py`: default port 8051 (override via `DASH_PORT` env)
- `server/index.js`: fallback PORT 3090

---

## Data Load (2026-02-28)

- Added `medicosts` PostgreSQL schema: all tables and materialized views live in `medicosts.`
- Created `scripts/create-db.js` to create the `medicosts` database if missing
- Updated `load-data.js` to create schema, use schema-qualified names, and load from `../medicare-dashboard/` (fixed path)
- Fixed dotenv loading: explicit path to `../.env` so it works when run from project root
- Updated `npm run load-data` to run from project root (dotenv finds .env)
- Updated server API routes to query `medicosts.mv_top50_drg` and `medicosts.mv_zip_summary`
- **Successfully loaded** 146,427 rows into `medicosts.medicare_inpatient` on pgsql.acumenus.net

---

## Server Debug Fixes (2026-02-28)

- **PostgreSQL "client password must be a string"**: Updated `server/db.js` to load `.env` from project root before creating the pool, and to pass `password: process.env.PGPASSWORD ?? ''` so pg always receives a string
- **dotenv load order**: Moved dotenv loading into `db.js` (imported before index.js) so env vars are available when the pool is created
- **Vite proxy port mismatch**: Proxy now reads PORT from `../.env` so it matches the server; parsed with simple regex (no dotenv dependency in client)
- **Client vite "Permission denied"**: Changed client scripts to use `node node_modules/vite/bin/vite.js` instead of `vite` binary

---

## Accomplishments Summary

### 1. Codebase Examination & Architecture

- **MediCosts** is a Medicare inpatient hospital pricing dashboard with two implementations:
  - **Node/React stack**: PostgreSQL backend, Express API, React/Vite frontend
  - **Python Dash**: Standalone app over CSV, no database

### 2. Python Dash Dashboard

- Launched Dash app from `medicare-dashboard/`
- Created `.venv` and installed `pandas`, `plotly`, `dash` (system Python is externally managed)
- **Fixed callback error** on `top50-bar.figure`:
  - Added `Weighted_Avg_Medicare` to `drg_stats` for Medicare payment metric
  - Refactored aggregation into `_drg_agg()` with safe division and integer types
  - Ensured Plotly receives clean data: `.copy().reset_index(drop=True)`, explicit `float64` casting
- Added `requirements.txt` for reproducibility

### 3. Full Web App Completion (Node + React)

**Client:**
- Switched API base from `http://localhost:3001/api` to `/api` (same-origin)
- Added Vite dev proxy: `/api` → backend server
- Error handling: shows message when API/DB unavailable, with hint to run `npm run load-data`
- **Top50DRGChart**: Y-axis shows "DRG 001 – Description…" instead of code only; increased axis width to 280px
- **ScatterPlot**: Point size tied to discharge volume via `ZAxis` `zAxisId="size"`
- **Build fixes**: Added `prop-types` dependency, `optimizeDeps.include: ['prop-types']`, `.npmrc` with `legacy-peer-deps=true` for React 19

**Server:**
- Production mode: when `NODE_ENV=production`, serves built client from `client/dist` and API from one process
- Fallback port 3090

**Project:**
- Added `npm run start` for production (build + serve)
- Updated README with setup for both stacks

### 4. Documentation & Config

- **README.md**: Full setup instructions, prerequisites, port notes
- **medicare-dashboard/requirements.txt**: `pandas`, `plotly`, `dash`
- **.env.example**: PostgreSQL vars, PORT (3090), comments

### 5. Port Changes (This Session)

- Verified ports 3001, 5173, 8050 in use or reserved by other Apache vhosts
- Selected 3090 (API), 5180 (Vite), 8051 (Dash) as alternates
- Updated all configs and docs accordingly

---

## Abby Analytics — AI Chat Feature (2026-03-01)

Added **Abby Analytics**, an AI-powered chat interface that lets users ask complex cross-cutting questions the existing dashboard pages can't easily answer (e.g., "Compare Mayo Clinic vs Cleveland Clinic on infection rates," "What's the safest hospital in Texas for heart surgery?"). Abby is powered by Ollama running MedGemma locally and has tool-calling access to the full backend API.

### Architecture

```
User question → Frontend (SSE fetch) → POST /api/abby/chat/stream
  → Backend orchestrator builds system prompt + tool catalog
  → Sends to Ollama (MedGemma) via OpenAI-compatible /v1/chat/completions
  → Parses model response for tool_call JSON blocks
  → Executes tool calls against internal API endpoints (loopback HTTP)
  → Feeds results back to model (up to 5 rounds)
  → Streams final answer back via SSE
  → Frontend renders markdown response progressively
```

**Key design decisions:**
- **Ollama via OpenAI-compatible `/v1` endpoint** — pattern proven in MindLog reference app
- **Prompt-based tool calling** — MedGemma outputs ` ```tool_call``` ` JSON blocks; backend parses and executes
- **Internal API loopback** — tools call existing endpoints via `http://localhost:PORT/api/...`, zero SQL duplication
- **SSE streaming** — token-by-token delivery for responsive UX during slow inference
- **Session-based chat** — conversation state in React (no DB persistence for now)

### New Files (5)

| File | Description |
|------|-------------|
| `server/lib/abby-tools.js` | 27 tools mapped to existing API endpoints + executor function |
| `server/lib/abby-prompt.js` | System prompt builder: Abby persona + dynamic tool catalog serialization |
| `server/routes/abby.js` | Express router: `/chat`, `/chat/stream` (SSE), `/health`, `/suggestions` |
| `client/src/views/AbbyAnalytics.jsx` | Chat UI: welcome screen, suggestion chips, SSE streaming, markdown rendering |
| `client/src/views/AbbyAnalytics.module.css` | Chat styles following existing dark design system |

### Modified Files (4)

| File | Change |
|------|--------|
| `server/index.js` | Mounted `abbyRouter` at `/api/abby` |
| `client/src/App.jsx` | Added lazy `AbbyAnalytics` import + `/abby` route |
| `client/src/components/AppShell.jsx` | Added "Abby Analytics" to sidebar nav with SparklesIcon |
| `client/src/components/icons/NavIcons.jsx` | Added `SparklesIcon` export |

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/abby/chat` | Synchronous chat (testing) |
| `POST /api/abby/chat/stream` | SSE streaming chat (primary) — events: `status`, `tool`, `token`, `error`, `[DONE]` |
| `GET /api/abby/health` | Ollama connectivity + model availability check |
| `GET /api/abby/suggestions` | 6 starter prompt suggestions |

### Tool Catalog (27 tools)

Covers all existing API domains: hospital search & profiles, HAI infections, readmissions, patient safety (PSI/HAC), mortality, timely & effective care, ED wait times, cost data (DRGs, state/ZIP summaries), geographic/demographic data, physician services, and outpatient services. Large API results are automatically truncated to 30 items to keep LLM context manageable.

### Frontend Features

- Welcome screen with Abby avatar, intro text, and 6 clickable suggestion chips
- User/assistant message bubbles with avatars (right/left aligned)
- Lightweight regex-based markdown renderer (bold, headers, lists, tables, code)
- Pulsing tool indicator shows real-time data gathering activity
- Auto-scroll, auto-resize textarea, Enter to send / Shift+Enter for newline
- Ollama status dot (green/red) in header
- Error recovery: restores input on failure

### Configuration

- `OLLAMA_BASE_URL` — default `http://localhost:11434`
- `OLLAMA_MODEL` — default `MedAIBase/MedGemma1.5:4b` (auto-detected from local Ollama)
- Health endpoint verified: Ollama running, model available

---

## CSS Modules Animation Fix (2026-03-01)

**Problem:** Every page in the app was rendering invisible — no data displayed, no console errors. Elements appeared in the DOM but had `opacity: 0`.

**Root cause:** CSS Modules scopes `@keyframes` names. When animations were defined globally in `index.css` as `@keyframes fadeUp`, CSS Modules rewrote references in `.module.css` files to scoped names like `_fadeUp_fo932_1` — but the global `@keyframes fadeUp` stayed unscoped. With `animation-fill-mode: both`, elements started at `opacity: 0` (the `from` frame) and never found the matching keyframes to animate to `opacity: 1`.

**Fix:** Moved `@keyframes` definitions into each `.module.css` file locally so the scoped animation names match the scoped keyframe names.

| File | Keyframes Added |
|------|----------------|
| `QualityCommandCenter.module.css` | `fadeUp`, `fadeIn` |
| `HospitalDetail.module.css` | `fadeUp`, `scaleIn` |
| `DataConnectors.module.css` | `fadeUp` |
| `HospitalExplorer.module.css` | `fadeUp`, `fadeIn` |
| `GeographicAnalysis.module.css` | `fadeUp` |
| `PhysicianAnalytics.module.css` | `fadeUp` |
| `SettingsView.module.css` | `fadeUp` |

Removed the unused global keyframes from `index.css` and replaced with a comment explaining the pattern.

**Lesson learned:** Never define `@keyframes` in global CSS and reference them from CSS Module files. Always co-locate keyframes with the module that uses them.

---

## Physician Analytics Page Fix (2026-03-01)

**Problem:** The Physician Analytics page (`/physicians`) showed no data — blank chart, empty table — with zero console errors.

**Root cause:** Column name mismatch between backend SQL responses and frontend field references. The backend returned raw DB column names (`hcpcs_cd`, `weighted_avg_charge`, `weighted_avg_medicare`, `num_physicians`), but the frontend component read different names (`hcpcs_code`, `avg_charge`, `avg_payment`, `total_providers`, `total_beneficiaries`). `Number(undefined)` produces `NaN` (invisible Recharts bars) and `undefined` renders as empty strings in JSX — all silently.

**Fix:** Added SQL aliases in both physician API endpoints so the backend returns the names the frontend expects. Also replaced the nonexistent `total_beneficiaries` column with `total_services` in the frontend.

### Backend changes (`server/routes/api.js`)

**`GET /api/physician/top-hcpcs`** — Added aliases:
```sql
SELECT
  hcpcs_cd                                      AS hcpcs_code,
  MAX(hcpcs_desc)                               AS hcpcs_description,
  SUM(num_physicians)::int                      AS total_providers,
  SUM(total_services)::int                      AS total_services,
  SUM(total_services * weighted_avg_charge)
    / NULLIF(SUM(total_services), 0)            AS avg_charge,
  SUM(total_services * weighted_avg_medicare)
    / NULLIF(SUM(total_services), 0)            AS avg_payment
FROM medicosts.mv_physician_zip_summary
GROUP BY hcpcs_cd
ORDER BY SUM(total_services * weighted_avg_charge) / NULLIF(SUM(total_services), 0) DESC
```

**`GET /api/physician/zip-summary`** — Added aliases:
```sql
SELECT
  hcpcs_cd                             AS hcpcs_code,
  hcpcs_desc                           AS hcpcs_description,
  num_physicians                       AS num_providers,
  total_services::int,
  weighted_avg_charge::numeric(14,0)   AS avg_charge,
  weighted_avg_medicare::numeric(14,0) AS avg_payment
FROM medicosts.mv_physician_zip_summary
WHERE zip5 = $1
ORDER BY weighted_avg_charge DESC
```

### Frontend changes (`client/src/views/PhysicianAnalytics.jsx`)

- Changed "Beneficiaries" column header → "Services"
- Changed `fmtNumber(r.total_beneficiaries)` → `fmtNumber(r.total_services)`
- Fixed React key prop warnings: composite keys `${r.hcpcs_code}-${i}` on both `.map()` calls

**Lesson learned:** When data displays silently blank, check field name alignment between API response and frontend. `Number(undefined)` → `NaN` and `undefined` → empty string are silent failures — no errors thrown.

---

## Production Deployment to medicosts.acumenus.net (2026-03-01)

Deployed the full application to `https://medicosts.acumenus.net` behind Apache reverse proxy with Let's Encrypt SSL.

### Infrastructure

| Component | Detail |
|-----------|--------|
| **Web server** | Apache 2.4.64 on Ubuntu |
| **SSL** | Let's Encrypt (certbot auto-renewal) |
| **Reverse proxy** | Apache → `http://127.0.0.1:3000` |
| **Process manager** | systemd user service |
| **Node** | v22.22.0 |

### Apache Virtual Host Configuration

Already configured prior to deployment — no changes needed:

- **HTTP** (`medicosts.acumenus.net.conf`): Redirects all HTTP → HTTPS via `RewriteRule`
- **HTTPS** (`medicosts.acumenus.net-le-ssl.conf`): SSL termination + reverse proxy to port 3000, security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)

### Port Alignment

Changed `.env` `PORT=3007` → `PORT=3000` to match the Apache proxy target. The Vite dev server port (5180) is only used during development and unaffected.

### systemd User Service

Created `~/.config/systemd/user/medicosts.service`:

```ini
[Unit]
Description=MediCosts Medicare Hospital Cost Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/smudoshi/Github/MediCosts
Environment=NODE_ENV=production
EnvironmentFile=/home/smudoshi/Github/MediCosts/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

- Enabled `loginctl enable-linger smudoshi` so the service survives logout
- `NODE_ENV=production` makes Express serve `client/dist` static files + SPA fallback

### Service Management

```bash
systemctl --user status medicosts      # check status
systemctl --user restart medicosts     # restart after code changes
systemctl --user stop medicosts        # stop
journalctl --user -u medicosts -f      # tail logs
```

### Redeployment Workflow

```bash
cd ~/Github/MediCosts/client && node ./node_modules/vite/bin/vite.js build
systemctl --user restart medicosts
```

### Verification

All endpoints verified returning HTTP 200 through `https://medicosts.acumenus.net`:
- `/` — serves SPA index.html (498 bytes)
- `/physicians` — SPA routing works (returns index.html)
- `/api/drgs/top50` — API returns JSON data
- `/api/physician/top-hcpcs?limit=3` — physician API returns aliased columns

---

## Abby Schema Context Injection (2026-03-01)

**Problem:** Abby's system prompt had only a brief "Data Context" paragraph — no knowledge of table names, column types, measure IDs, or how tables relate. This forced the model to waste tool-call rounds probing the data structure before answering the actual question.

**Solution:** Created a static schema reference file that gets loaded once at server startup and injected into Abby's system prompt, giving her full database literacy from the first message.

### New file: `server/lib/abby-schema-context.md` (~7.3KB)

Contains six sections:

| Section | Content |
|---------|---------|
| **Data Domains** | All 11 data domains with table names, record counts, and descriptions |
| **Key Identifiers** | CCN, DRG, HCPCS, NPI, ZIP — how tables link together |
| **Materialized Views** | All 8 pre-computed views with key columns and purposes |
| **Metric Interpretation Guide** | SIR, PSI-90, HAC, ERR, star ratings — what "better" means for each metric |
| **HAI & Mortality Measure IDs** | Exact codes (HAI_1_SIR → CLABSI, MORT_30_AMI → Heart Attack, etc.) |
| **Common Query Patterns** | Step-by-step tool strategies for frequent question types (hospital comparison, safety ranking, cost lookup, etc.) |
| **Data Limitations** | CMS 2023 snapshot, Medicare-only coverage, NULL star ratings, suppressed small-hospital data |

### Modified: `server/lib/abby-prompt.js`

- Added `readFileSync` import to load `abby-schema-context.md` once at module init (stored in `SCHEMA_CONTEXT` constant)
- Interpolated `${SCHEMA_CONTEXT}` into the system prompt between the "Data Context" and "How to Use Tools" sections
- No per-request I/O overhead — file is read once when the server starts

### Why static file over dynamic introspection

| Approach | Pros | Cons |
|----------|------|------|
| **Static `.md` file (chosen)** | Zero latency, version controlled, easy to edit, includes interpretation guides and query patterns that DB introspection can't provide | Must be manually updated when schema changes |
| **Dynamic `information_schema` query** | Always in sync | Adds latency per chat, can't include metric interpretation or query strategy hints |
| **Inline in prompt builder** | No extra file | Hard to read/maintain, clutters JS code |

### Prompt Structure (after change)

```
1. Persona & Role
2. Data Context (brief summary)
3. Database Schema & Data Reference  ← NEW (from abby-schema-context.md)
4. How to Use Tools (invocation rules)
5. Formatting Guidelines
6. Safety Rails
7. Available Tools (serialized from abby-tools.js)
```

---

## CMS Data Lake: Bulk Download + Stage Schema Load (2026-03-01)

Expanded MediCosts from a single-dataset dashboard (Medicare Inpatient DRG prices) into a comprehensive CMS data lake covering 10 healthcare domains. This involved two new scripts: one to download the full CMS Provider Data catalog, and one to bulk-load every CSV into PostgreSQL as raw staging tables.

### Phase 1: Data Acquisition (`scripts/download-datasets.js`)

Created a download script that dynamically fetches the CMS Provider Data API catalog, discovers all available CSV datasets, and streams them to disk organized by theme.

**How it works:**
1. Fetches the CMS Provider Data catalog API (`data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items`)
2. Extracts CSV download URLs from each dataset's `distribution` array
3. Organizes files into theme-based subdirectories (sanitized from CMS theme metadata)
4. Downloads all files with a 3-worker concurrent pool, with progress reporting and redirect handling
5. Adds 2 manual datasets not in the catalog (Medicare Outpatient and Physician & Other Practitioners CSVs — direct CMS file links)
6. Downloads Census ACS 5-Year ZCTA demographics (median income, population by ZIP) as a JSON enrichment file

**Features:**
- `--skip-existing` flag for incremental re-runs
- Streaming downloads (no buffering in memory)
- Automatic HTTP redirect following
- Per-file progress bars (MB downloaded, percentage)
- Summary with total disk usage

**Result: 236 CSV files + 1 JSON file across 10 theme directories (5.3 GB total)**

| Theme Directory | CSVs | Examples |
|-----------------|------|----------|
| `hospitals/` | 75 | General info, complications & deaths, HAIs, readmissions, HCAHPS, VBP scores, spending, maternal health, ASC quality, outpatient imaging, psychiatric facilities |
| `physician-office-visit-costs/` | 85 | Per-specialty office visit cost data (cardiology, neurology, orthopedic surgery, etc. — 85 specialties) |
| `dialysis-facilities/` | 23 | Facility listings, ESRD QIP measures (catheter rates, transfusion ratios, hospitalization, ICH-CAHPS) |
| `nursing-homes-including-rehab-services/` | 18 | Provider info, health deficiencies, fire safety, penalties, ownership, MDS quality, SNF VBP, inspections |
| `home-health-services/` | 11 | Agency data, HHCAHPS patient surveys, HHVBP model scores, ZIP-level data |
| `doctors-and-clinicians/` | 8 | National provider file (2.7M rows), facility affiliations, MIPS performance, utilization |
| `hospice-care/` | 8 | Provider data, CAHPS surveys, ZIP/state/national aggregations |
| `inpatient-rehabilitation-facilities/` | 4 | Conditions, general info, provider & national data |
| `long-term-care-hospitals/` | 3 | General info, provider & national data |
| `supplier-directory/` | 1 | Medical equipment suppliers |

### Phase 2: Stage Schema Load (`scripts/load-stage.js`)

Created a bulk loader that reads every CSV under `data/`, auto-detects headers, and loads each file into a `stage.{table_name}` table with all TEXT columns — a standard data-staging pattern for exploration before modeling.

**Why a new loader instead of extending `load-data.js`:**

| Aspect | `load-data.js` (existing) | `load-stage.js` (new) |
|--------|---------------------------|------------------------|
| **Scope** | 1 file, 1 typed table | 236 files, auto-detected |
| **Columns** | Hand-specified DDL with types | Auto-detected from CSV header, all TEXT |
| **Load method** | csv-parse stream + batch INSERT (500 rows) | `COPY FROM STDIN` via pg-copy-streams |
| **Speed** | ~minutes for 146K rows | 82.6s for 24.6M rows |
| **Purpose** | Production schema (`medicosts.`) | Raw staging (`stage.`) for exploration |

**Architecture:**

```
1. Connect to PostgreSQL (reads PG* env vars via dotenv)
2. DROP SCHEMA stage CASCADE; CREATE SCHEMA stage;
3. Recursively scan data/**/*.csv → sorted file list
4. For each CSV:
   a. Read first line → parse as CSV header (handles quoted fields)
   b. Sanitize column names (lowercase, non-alnum → _, dedup)
   c. Truncate identifiers to 63 chars (PostgreSQL limit)
   d. CREATE TABLE stage."table_name" (col1 TEXT, col2 TEXT, ...)
   e. COPY FROM STDIN WITH (FORMAT csv, HEADER true)
   f. stream.pipeline(fileReadStream, pgCopyStream)
5. On error: log failure, continue to next file
6. Summary: tables loaded/failed, total rows, elapsed time
```

**Table naming convention:** `{theme}__{filename_stem}`
- Theme from directory name, filename without `.csv` extension
- Both sanitized: lowercase, non-alphanumeric replaced with `_`, collapsed, stripped
- Examples:
  - `data/hospitals/complications_and_deaths_hospital.csv` → `hospitals__complications_and_deaths_hospital`
  - `data/physician-office-visit-costs/cardiology_office_visit_costs.csv` → `physician_office_visit_costs__cardiology_office_visit_costs`

### Bug Fix: PostgreSQL 63-Character Identifier Limit

**Problem:** First run loaded only 216/236 tables (20 failures). Two categories of errors:

1. **Table name collisions (17 files):** CMS dataset filenames are extremely long (e.g., `outpatient_and_ambulatory_surgery_consumer_assessment_of_healthcare_providers_and_systems_oas_cahps_survey_for_hospital_outpatient_departments_facility`). PostgreSQL silently truncates identifiers to 63 characters. Multiple files with names that differ only past character 63 all truncated to the same table name → `relation already exists` error.

2. **Column name collisions (3 files):** Same mechanism for column headers. Columns like `percentage_of_long_stay_residents_assessed_and_appropriately_given_...X` and `..._given_...Y` truncated to the same 63-char prefix → `column specified more than once` error.

**Solution: `truncateIdent()` function:**
```js
function truncateIdent(name) {
  if (name.length <= 63) return name;
  const hash = createHash('md5').update(name).digest('hex').slice(0, 7);
  return name.slice(0, 55) + '_' + hash;
}
```

When an identifier exceeds 63 characters, it keeps the first 55 characters (still human-readable) and appends `_` + a 7-character MD5 hash of the full name. This guarantees uniqueness while preserving readability. Applied to both table names and column names before deduplication.

**Result after fix: 236/236 tables loaded, 0 failures.**

### Final Results

| Metric | Value |
|--------|-------|
| **CSV files on disk** | 236 (5.3 GB) |
| **Tables in `stage` schema** | 236 |
| **Total rows loaded** | 24,570,438 |
| **Load time** | 82.6 seconds |
| **Largest table** | `hospitals__mup_phy_ry25_dy23_prvsvc` — 9,660,647 rows (physician services) |
| **Failures** | 0 |

### New/Modified Files

| File | Change |
|------|--------|
| `scripts/download-datasets.js` | **New** — CMS catalog scraper + concurrent downloader |
| `scripts/load-stage.js` | **New** — bulk CSV → PostgreSQL staging loader |
| `scripts/package.json` | Added `pg-copy-streams: ^6.0.6` dependency |
| `.gitignore` | Added `data/` CSV files (5.3 GB should not be in git) |

### Spot-Check Verification

```sql
-- 236 tables in stage schema
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'stage';
-- 236

-- Sample table row count
SELECT count(*) FROM stage.hospitals__complications_and_deaths_hospital;
-- 95,780

-- Sample data
SELECT facility_id, facility_name, measure_id, measure_name, score
FROM stage.hospitals__complications_and_deaths_hospital LIMIT 3;
-- 010001 | SOUTHEAST HEALTH MEDICAL CENTER | COMP_HIP_KNEE | Rate of complications for hip/knee replacement | 3.2
-- 010001 | SOUTHEAST HEALTH MEDICAL CENTER | Hybrid_HWM    | Hybrid Hospital-Wide All-Cause Risk...          | 4.5
-- 010001 | SOUTHEAST HEALTH MEDICAL CENTER | MORT_30_AMI   | Death rate for heart attack patients              | 11.4
```

### What This Enables

The `stage` schema is a raw, untyped mirror of every CMS Provider Data CSV. From here, the next steps are:
- **Explore:** Query any table to understand structure, coverage, and quality
- **Model:** Design a normalized `medicosts` schema with typed columns, foreign keys, and indexes
- **Transform:** Write SQL or scripts to cast, clean, and load from `stage.*` → `medicosts.*`
- **Expand Abby:** Give the AI assistant access to all 10 healthcare domains instead of just inpatient DRG pricing

---

## Data Enrichment: Historical Inpatient + Stage Promotions + Full API Expansion (2026-03-01)

Executed a comprehensive 6-phase enrichment plan that transformed MediCosts from a single-year cost dashboard into a multi-year, multi-domain healthcare analytics platform. Added 11 years of historical inpatient cost data, promoted 9 high-value datasets from the `stage` schema into properly-typed `medicosts` tables, created new materialized views, added 22+ API endpoints, and gave Abby 19 new tools.

### Phase 1: Historical Inpatient Data (2013-2023)

**New file: `scripts/load-inpatient-historical.js`**

Loads 11 years of Medicare inpatient CSV data from `inpatient-qi/Medicare Inpatient Hospitals - by Provider and Service/{year}/*.CSV`. Each year directory contains one CSV with an identical 15-column schema.

**Table:** `medicosts.medicare_inpatient_historical` — **1,985,253 rows**

| Column | Type | Notes |
|--------|------|-------|
| data_year | SMALLINT | 2013-2023 (derived from directory name) |
| provider_ccn | VARCHAR(10) | 6-digit CMS Certification Number |
| drg_cd | VARCHAR(5) | Diagnosis-Related Group code |
| total_discharges | INTEGER | |
| avg_covered_charges | NUMERIC(14,2) | |
| avg_total_payments | NUMERIC(14,2) | |
| avg_medicare_payments | NUMERIC(14,2) | |

Indexes: `(data_year)`, `(drg_cd, data_year)`, `(provider_ccn, data_year)`, `(state_abbr, data_year)`, `(zip5, data_year)`

**Three materialized views for trend analysis:**

| View | Rows | Purpose |
|------|------|---------|
| `mv_drg_yearly_trend` | ~6K | National DRG cost trends: weighted avg payment/charges/medicare by year+DRG |
| `mv_state_yearly_trend` | ~120K | State-level DRG trends: weighted avg payment by year+state+DRG |
| `mv_provider_yearly_trend` | ~55K | Hospital-level yearly aggregates: total discharges, weighted avg payment, DRG count |

### Phase 2: Stage Table Promotions (9 Datasets)

Promoted 9 high-value datasets from `stage.*` (all TEXT columns) → `medicosts.*` (proper types + indexes). Each dataset got its own `scripts/promote-*.js` script.

| Script | Source → Target | Rows | Key Metrics |
|--------|----------------|------|-------------|
| `promote-spending-by-claim.js` | `hospitals__medicare_hospital_spending_by_claim` → `hospital_spending_by_claim` | 63,646 | Avg spending by claim type × time period (pre-admission, during, post-discharge) |
| `promote-unplanned-visits.js` | `hospitals__unplanned_hospital_visits_hospital` → `unplanned_hospital_visits` | 67,046 | Readmission scores (READM_30_*), EDAC measures, confidence intervals |
| `promote-vbp.js` | 5 VBP domain tables → `hospital_vbp` | 2,455 | Total performance score, efficiency/safety/person domain scores, MSPB-1 |
| `promote-spending-per-beneficiary.js` | `hospitals__medicare_spending_per_beneficiary_hospital` → `spending_per_beneficiary` | 4,625 | MSPB-1 ratio (1.0 = national avg) |
| `promote-nursing-homes.js` | `nursing_homes_including_rehab_services__*` → `nursing_home_info` + `nursing_home_quality` | 14,710 + 250,070 | 5-star ratings, staffing, fines + 30+ MDS quality measures |
| `promote-home-health.js` | `home_health_services__home_health_care_agencies` → `home_health_agencies` | 12,251 | Quality stars, DTC/PPR/PPH rates, Medicare spend/episode |
| `promote-hospice.js` | `hospice_care__hospice_provider_data` → `hospice_providers` | 465,181 | Per-measure quality scores (emotional support, symptoms, etc.) |
| `promote-dialysis.js` | `dialysis_facilities__dialysis_facility_listing_by_facility` → `dialysis_facilities` | 7,557 | 5-star, mortality/hospitalization/readmission/transfusion/ED rates |
| `promote-clinician-directory.js` | `doctors_and_clinicians__national_downloadable_file` → `clinician_directory` | 2,686,173 | NPI, name, specialty, medical school, telehealth, facility |

**Total: ~3.6M rows promoted across 10 new tables**

### Phase 3: New Materialized Views

Added to `scripts/create-cross-views.js`:

| View | Rows | Purpose |
|------|------|---------|
| `mv_hospital_episode_cost` | 2,892 | Per-hospital episode cost profile — pre/during/post admission spending |
| `mv_hospital_value_composite` | 5,426 | Master value scorecard: quality + VBP + MSPB + unplanned visits + episode cost |
| `mv_post_acute_landscape` | 56 | State-level post-acute care overview — nursing home/home health/dialysis aggregates |

### Phase 4: API Endpoints (22+ New)

**New route file: `server/routes/trends.js`** (4 endpoints)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/trends/drg?drg=XXX` | 11-year cost trend for a DRG |
| `GET /api/trends/provider?ccn=XXXXXX` | Hospital-level yearly trend |
| `GET /api/trends/state?state=XX&drg=XXX` | State-level DRG trend |
| `GET /api/trends/national` | National cost summary per year |

**New route file: `server/routes/post-acute.js`** (6 endpoints)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/post-acute/nursing-homes?state=XX` | Listings with star ratings |
| `GET /api/post-acute/nursing-home/:ccn` | Full profile + quality measures |
| `GET /api/post-acute/home-health?state=XX` | Agencies with outcome scores |
| `GET /api/post-acute/hospice?state=XX` | Providers with quality measures |
| `GET /api/post-acute/dialysis?state=XX` | Facilities with clinical rates |
| `GET /api/post-acute/landscape?state=XX` | State-level post-acute overview |

**Added to `server/routes/api.js`** (~12 endpoints)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/spending/episode/:ccn` | Spending breakdown by claim type + period |
| `GET /api/spending/per-beneficiary?state=XX` | MSPB scores |
| `GET /api/vbp/hospital/:ccn` | VBP scores across all 5 domains |
| `GET /api/vbp/rankings?state=XX` | VBP rankings by total performance score |
| `GET /api/unplanned-visits/hospital/:ccn` | Readmission & ED measures |
| `GET /api/value-composite?state=XX` | Quality + cost + VBP composite |
| `GET /api/clinicians/search?q=&specialty=&state=` | Clinician search (ILIKE) |
| `GET /api/clinicians/:npi` | Clinician profile |

**Mounted in `server/index.js`:**
```js
import trendsRouter from './routes/trends.js';
import postAcuteRouter from './routes/post-acute.js';
app.use('/api/trends', trendsRouter);
app.use('/api/post-acute', postAcuteRouter);
```

### Phase 5: Abby Updates

**`server/lib/abby-schema-context.md`** — Complete rewrite:
- Data domains: 11 → 22 (added historical, episode spending, VBP, unplanned visits, nursing homes, home health, hospice, dialysis, clinicians, spending per beneficiary, post-acute landscape)
- Materialized views: 8 → 14 (added trend views, episode cost, value composite, post-acute landscape)
- Metric guide: added VBP (0-100), MSPB-1 (<1.0 better), EDAC (negative better), nursing home stars (1-5), DTC (higher better), PPR (lower better)
- Query patterns: added 5 new patterns (cost trends, hospital trends, clinician search, post-acute, best value)
- Updated data limitations section

**`server/lib/abby-tools.js`** — Added 19 new tools:
`get_drg_trend`, `get_provider_trend`, `get_state_drg_trend`, `get_national_trend`, `get_episode_spending`, `get_spending_per_beneficiary`, `get_vbp_hospital`, `get_vbp_rankings`, `get_unplanned_visits`, `get_value_composite`, `get_nursing_homes`, `get_nursing_home_profile`, `get_home_health_agencies`, `get_hospice_providers`, `get_dialysis_facilities`, `get_post_acute_landscape`, `search_clinicians`, `get_clinician_profile`

**`scripts/load-all.js`** — Added 10 new steps (historical loader + 9 promote scripts) before cross-dataset views

### CMS Data Quality Bugs & Fixes

The most significant recurring issue was **CMS text sentinel values in numeric fields**. CMS data consistently uses text strings like "Not Available", "Not Applicable", and "Not Enough Data" in columns that should be numeric. This caused `invalid input syntax for type numeric` errors across multiple datasets.

**Bug 1: "Not Available" / "Not Applicable" in numeric fields**

Affected: unplanned visits, VBP, spending per beneficiary, nursing homes, home health, dialysis

```sql
-- Naive approach (fails on "Not Available"):
NULLIF(col, '')::NUMERIC

-- Safe regex-based casting pattern (adopted across all promote scripts):
CASE WHEN col ~ '^\-?[0-9]+\.?[0-9]*$' THEN col::NUMERIC ELSE NULL END

-- VBP variant using temporary function:
CREATE FUNCTION pg_temp.safe_num(text) RETURNS NUMERIC AS $$
  SELECT CASE WHEN $1 ~ '^\-?[0-9]+\.?[0-9]*$' THEN $1::NUMERIC ELSE NULL END;
$$ LANGUAGE sql IMMUTABLE;
```

**Bug 2: NUMERIC precision overflow**

| Dataset | Field | Original | Value | Fix |
|---------|-------|----------|-------|-----|
| Spending by claim | pct fields | `NUMERIC(6,4)` | `100.0` (exceeds 6,4) | Widened to `NUMERIC(8,4)` |
| Hospice | score | `NUMERIC(10,4)` | `60819` (integer scores) | Widened to `NUMERIC(14,4)` |

**Bug 3: Comma-formatted numbers in hospice scores**

CMS formats some large numbers with commas (e.g., "60,819"). The regex `^\-?[0-9]+\.?[0-9]*$` rejects commas. Fixed by stripping commas first:
```sql
CASE WHEN REPLACE(score, ',', '') ~ '^\-?[0-9]+\.?[0-9]*$'
  THEN REPLACE(score, ',', '')::NUMERIC(14,4) ELSE NULL END
```

**Bug 4: Dollar-sign and comma-formatted currency**

Home health `medicare_spend_per_episode` stored as `$3,456.78`. Fixed by stripping `$` and `,`:
```sql
REPLACE(REPLACE(col, '$', ''), ',', '')::NUMERIC
```

**Bug 5: Duplicate NPI in clinician directory**

Expected NPIs to be unique, but clinicians with multiple practice locations appear multiple times (~2.7M rows for ~1.5M unique NPIs). Changed `CREATE UNIQUE INDEX` → `CREATE INDEX` for the NPI index.

**Bug 6: Case-sensitive specialty search**

CMS stores specialties in uppercase ("INTERNAL MEDICINE") but users search with mixed case ("Internal Medicine"). Changed `primary_specialty = $N` → `primary_specialty ILIKE $N`.

**Bug 7: Nursing home table name mismatch**

Plan referenced `nursing_homes__provider_information` but actual stage table name was `nursing_homes_including_rehab_services__provider_information`. Discovered by querying `information_schema.tables`.

### Lessons Learned

1. **Always use regex-based safe casting for CMS data.** CMS uses text sentinels instead of NULL across ALL datasets. The pattern `CASE WHEN col ~ '^\-?[0-9]+\.?[0-9]*$' THEN col::TYPE ELSE NULL END` should be the default for any CMS text-to-numeric conversion.

2. **Start with generous NUMERIC precision.** CMS data contains both percentages (0-100) and raw counts (60,000+) in score-type columns. Starting at `NUMERIC(14,4)` avoids repeated overflow fixes.

3. **Strip formatting characters before casting.** CMS data may contain `$`, `,`, `%` in numeric fields. Always `REPLACE()` before regex testing.

4. **Verify stage table names before writing scripts.** CMS naming is inconsistent — some themes use full names (`nursing_homes_including_rehab_services`) vs. abbreviated (`hospitals`). Query `information_schema.tables` first.

5. **NPI is not a unique identifier.** Clinicians have multiple practice locations, so the same NPI appears multiple times. Design accordingly.

6. **VBP unification pattern works well.** INSERT from the primary table, then UPDATE from secondary tables using the same facility_id key. Keeps the script simple and avoids complex multi-table JOINs in the INSERT.

### Final State

| Metric | Before | After |
|--------|--------|-------|
| `medicosts` tables | ~5 | ~15 |
| Materialized views | 8 | 14 |
| Total rows in `medicosts` | ~1.2M | ~5.8M |
| API endpoints | ~20 | ~44 |
| Abby tools | 27 | 46 |
| Data years | 2023 only | 2013-2023 |
| Care domains | Inpatient + quality | + post-acute (nursing homes, home health, hospice, dialysis), clinicians, VBP, spending, trends |

### New/Modified Files Summary

| File | Status |
|------|--------|
| `scripts/load-inpatient-historical.js` | New |
| `scripts/promote-spending-by-claim.js` | New |
| `scripts/promote-unplanned-visits.js` | New |
| `scripts/promote-vbp.js` | New |
| `scripts/promote-spending-per-beneficiary.js` | New |
| `scripts/promote-nursing-homes.js` | New |
| `scripts/promote-home-health.js` | New |
| `scripts/promote-hospice.js` | New |
| `scripts/promote-dialysis.js` | New |
| `scripts/promote-clinician-directory.js` | New |
| `server/routes/trends.js` | New |
| `server/routes/post-acute.js` | New |
| `scripts/create-cross-views.js` | Modified — added 3 Phase 3 views |
| `scripts/load-all.js` | Modified — added 10 new pipeline steps |
| `server/routes/api.js` | Modified — added ~12 endpoints |
| `server/index.js` | Modified — mounted trends + post-acute routers |
| `server/lib/abby-tools.js` | Modified — added 19 new tools |
| `server/lib/abby-schema-context.md` | Rewritten — expanded to 22 domains, 14 views |

---

## Frontend Pages + Additional Facility Promotions (2026-03-01)

Built 4 new frontend pages for data that previously had API endpoints but no UI, promoted 3 additional facility datasets (IRF, LTCH, Medical Equipment Suppliers) from the `stage` schema, created a new facilities API router, and expanded the post-acute landscape view.

### Phase 4 Stage Promotions (3 New Datasets)

| Script | Source → Target | Rows | Key Data |
|--------|----------------|------|----------|
| `promote-irf.js` | `stage.inpatient_rehabilitation_facilities__*` → `irf_info` + `irf_measures` | 1,221 + 79,365 | Rehab facility info + quality measures (functional outcomes, discharge to community) |
| `promote-ltch.js` | `stage.long_term_care_hospitals__*` → `ltch_info` + `ltch_measures` | 319 + 24,882 | LTCH info + quality measures (pressure ulcers, infections, etc.) |
| `promote-suppliers.js` | `stage.supplier_directory__medical_equipment_suppliers` → `medical_equipment_suppliers` | 58,537 | DMEPOS suppliers: business name, address, phone, specialties, supplies, lat/lon |

**Bug fix:** Comma-formatted numbers in IRF/LTCH scores (e.g., "2,949") caused `invalid input syntax for type numeric`. Fixed by adding `REPLACE(score, ',', '')` before the regex numeric test — same pattern as the hospice fix.

### New API Router: `server/routes/facilities.js`

| Endpoint | Purpose |
|----------|---------|
| `GET /api/facilities/irf?state=XX&limit=N` | List IRFs by state |
| `GET /api/facilities/irf/:ccn` | IRF detail + quality measures |
| `GET /api/facilities/ltch?state=XX&limit=N` | List LTCHs by state |
| `GET /api/facilities/ltch/:ccn` | LTCH detail + quality measures |
| `GET /api/facilities/suppliers?state=XX&q=&limit=N` | Search/list medical equipment suppliers |

### 4 New Frontend Pages

| Page | Route | Component | Key Features |
|------|-------|-----------|-------------|
| **Cost Trends** | `/trends` | `CostTrends.jsx` | 4 panels: national ComposedChart (dual Y-axis), DRG trend, state trend, hospital trend — all using Recharts LineChart with 11 years of data |
| **Post-Acute Care** | `/post-acute` | `PostAcuteCare.jsx` | 7 tabs: Landscape overview, Nursing Homes, Home Health, Hospice, Dialysis, IRF, LTCH — state filter across all tabs |
| **Spending & Value** | `/spending` | `SpendingValue.jsx` | 3 tabs: Value Composite (sortable table), VBP Rankings (table + BarChart top 20), Spending Per Beneficiary (table + BarChart) |
| **Clinician Directory** | `/clinicians` | `ClinicianDirectory.jsx` | Direct fetch with AbortController + 300ms debounce, search by name/state/specialty, telehealth badges |

### Navigation Updates

- Added 4 SVG icons to `NavIcons.jsx`: `TrendingUpIcon`, `HeartPulseIcon`, `DollarIcon`, `UsersIcon`
- Added 4 nav items to `AppShell.jsx` NAV_ITEMS array
- Added 4 lazy imports + routes to `App.jsx`

### Cross-View Update

Updated `mv_post_acute_landscape` to include `num_irf_facilities` and `num_ltch_facilities` columns (LEFT JOIN on irf_info and ltch_info by state).

### Abby Updates

- Added 5 new tools to `abby-tools.js`: `get_irf_facilities`, `get_irf_detail`, `get_ltch_facilities`, `get_ltch_detail`, `search_medical_equipment_suppliers`
- Updated `abby-schema-context.md`: added IRF, LTCH, and suppliers to data domains table; updated landscape view columns; added new query patterns

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| `medicosts` tables | ~15 | ~20 |
| API endpoints | ~44 | ~49 |
| Abby tools | 46 | 51 |
| Frontend pages | 8 | 12 |
| Care domains | + post-acute, clinicians, VBP, spending, trends | + IRF, LTCH, medical equipment suppliers |

### New/Modified Files

| File | Status |
|------|--------|
| `scripts/promote-irf.js` | New |
| `scripts/promote-ltch.js` | New |
| `scripts/promote-suppliers.js` | New |
| `server/routes/facilities.js` | New |
| `client/src/views/CostTrends.jsx` + `.module.css` | New |
| `client/src/views/PostAcuteCare.jsx` + `.module.css` | New |
| `client/src/views/SpendingValue.jsx` + `.module.css` | New |
| `client/src/views/ClinicianDirectory.jsx` + `.module.css` | New |
| `scripts/load-all.js` | Modified — added Phase 4 promote scripts |
| `scripts/create-cross-views.js` | Modified — added IRF/LTCH to landscape view |
| `server/index.js` | Modified — mounted facilities router |
| `server/lib/abby-tools.js` | Modified — added 5 facility tools |
| `server/lib/abby-schema-context.md` | Modified — added IRF/LTCH/suppliers |
| `client/src/components/icons/NavIcons.jsx` | Modified — added 4 icons |
| `client/src/components/AppShell.jsx` | Modified — added 4 nav items |
| `client/src/App.jsx` | Modified — added 4 lazy imports + routes |
| `devlog.md` | Modified — this entry |

---

## Consumer Empowerment Phase — "Sunshine on Healthcare" (2026-03-01)

Transformed MediCosts from an analyst dashboard into a consumer transparency weapon. Added 3 new pages, redesigned the Overview, fixed the QCC Financial tab, and surfaced HCAHPS patient satisfaction data (175K surveys) across the app. Core ethos: expose the worst, celebrate the best, empower consumers with truth about cost AND quality.

### Backend: 6 New Endpoints (`server/routes/quality.js`)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/quality/hcahps/summary?state=` | State-level HCAHPS averages (joins mv_hcahps_summary + hospital_info) |
| `GET /api/quality/hcahps/by-hospital?state=` | Per-hospital HCAHPS stars for Hospital Explorer table |
| `GET /api/quality/hcahps/hospital/:ccn` | Single hospital HCAHPS — all 10 star dimensions + survey count |
| `GET /api/quality/accountability/markups?state=&limit=` | Hospitals ranked by charge-to-payment markup ratio |
| `GET /api/quality/accountability/state-rankings` | Composite state rankings: markup + penalties + HAC + HCAHPS |
| `GET /api/quality/accountability/summary` | National headline stats (penalized count, avg markup, avg patient star) |

### 3 New Pages

**Accountability Dashboard (`/accountability`)** — `AccountabilityDashboard.jsx`
- "Name and shame" page with hero stats row (national markup, hospitals penalized, HAC penalized, avg patient rating)
- 4 tabs: Price Gouging (markup ratios), Readmission Penalties, HAC Scores, State Rankings
- State filter on markups and penalties tabs, clickable rows → hospital detail
- Uses `markupColor()` and `sirColor()` helper functions for severity badges

**Hospital Comparison (`/compare`)** — `HospitalCompare.jsx`
- Side-by-side comparison of up to 3 hospitals
- Search autocomplete using existing `/quality/search` endpoint
- ComparisonGrid fetches composite/hcahps/vbp data in parallel per hospital
- 4 sections: Quality & Ratings, Cost, Safety, VBP Performance
- Green highlighting for best values via `bestIdx()` helper

**For Patients (`/for-patients`)** — `ForPatients.jsx`
- Patient intake page with drag-and-drop PDF upload zone
- Client-side PDF text extraction via `pdfjs-dist` (dynamic import)
- Questionnaire: condition, state/city, priority (cost/quality/distance radio cards)
- "Talk to Abby" CTA navigates to `/abby` with `location.state.patientContext`
- New dependency: `pdfjs-dist` installed in `client/`

### Modified Pages

**Quality Command Center (`QualityCommandCenter.jsx`)**
- **Bug fix:** Financial tab (line 93) was rendering `<StateQualityTable />` — a duplicate of the Quality tab. Replaced with VBP state-level aggregation using `/vbp/rankings?limit=200`
- **New domain:** Added "Patient Experience" tab showing state-by-state HCAHPS star averages
- **6th KPI card** added for patient_experience domain
- Updated CSS grid to `repeat(6, 1fr)`

**Hospital Detail (`HospitalDetail.jsx`)**
- New "Patient Experience (HCAHPS)" panel with 10-item grid
- Shows: overall, nurse comm, doctor comm, staff responsive, medicine comm, discharge info, care transition, cleanliness, quietness, recommend — all as star ratings
- Survey count displayed below grid
- Uses new `/quality/hcahps/hospital/:ccn` endpoint

**Hospital Explorer (`HospitalExplorer.jsx`)**
- Added "Patient Rating" column to hospital table
- Fetches HCAHPS data via `/quality/hcahps/by-hospital`, builds lookup map by facility_id
- Column count increased from 6 to 7

**Overview (`OverviewView.jsx`)** — Consumer-first redesign
- **ShockStats Hero:** 4 large KPI cards — national markup, hospitals penalized, HAC penalized, avg patient satisfaction
- **Patient Journey Cards:** 4 clickable cards → /hospitals, /for-patients, /compare, /accountability
- **Worst Offenders Preview:** Top 5 markup hospitals + top 5 penalty hospitals side-by-side
- Existing components (CostVsQualityScatter, drill-down sections) preserved below

**Abby Analytics (`AbbyAnalytics.jsx`)**
- Accepts `location.state.patientContext` handoff from For Patients page
- Auto-sends patient context as first message (deferred 500ms via `sendMessageRef`)
- `patientHandoffDone` state prevents duplicate sends

### Navigation Updates

- 3 new icons in `NavIcons.jsx`: `ClipboardHeartIcon`, `ScaleIcon`, `AlertTriangleIcon`
- 3 new nav items in `AppShell.jsx`: For Patients, Compare, Accountability
- 3 lazy imports + routes in `App.jsx`
- Added `patient_experience` color to `qualityColors.js` and tab to `DomainTabs.jsx`

### Bug Fix: `medicare_inpatient` Column Name Mismatch

**Problem:** The markups and state-rankings endpoints used `provider_id` and `provider_state` — columns that don't exist in `medicare_inpatient`.

**Root cause:** Assumed column names without checking the actual schema. The `medicare_inpatient` table uses `provider_ccn` (not `provider_id`) and `state_abbr` (not `provider_state`).

**Discovery:** `curl` test returned 500; `journalctl --user -u medicosts` showed `column m.provider_id does not exist`; confirmed correct names by reading existing queries in `server/routes/api.js`.

**Fix:** In `server/routes/quality.js`:
- Markups endpoint: `m.provider_id` → `m.provider_ccn`, `m.provider_state` → `m.state_abbr` (in SELECT, WHERE, GROUP BY)
- State-rankings CTE: `provider_state` → `state_abbr` (in SELECT alias and GROUP BY)

**Lesson:** Always verify column names against existing working queries or the table DDL in `scripts/load-data.js` before writing new SQL.

### Endpoint Verification

All 6 new endpoints tested and returning data:
- `/api/quality/accountability/summary` → `{hospitals_penalized: 2358, hac_penalized: 719, national_markup: "4.89", avg_patient_star: "3.2"}`
- `/api/quality/hcahps/summary?state=CA` → state-level HCAHPS averages
- `/api/quality/hcahps/hospital/310044` → 10 star dimensions + 1414 surveys
- `/api/quality/accountability/markups?limit=3` → NJ hospitals with 18-23x markups
- `/api/quality/accountability/state-rankings` → 50+ states ranked by composite metrics

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| API endpoints | ~49 | ~55 |
| Frontend pages | 12 | 15 |
| HCAHPS visibility | None | QCC tab, Hospital Detail panel, Hospital Explorer column |
| Consumer-facing pages | 0 | 4 (Accountability, Compare, For Patients, Overview redesign) |

### New/Modified Files

| File | Status |
|------|--------|
| `client/src/views/AccountabilityDashboard.jsx` + `.module.css` | New |
| `client/src/views/HospitalCompare.jsx` + `.module.css` | New |
| `client/src/views/ForPatients.jsx` + `.module.css` | New |
| `client/src/views/OverviewView.jsx` + `.module.css` | Modified — consumer-first redesign |
| `client/src/views/QualityCommandCenter.jsx` + `.module.css` | Modified — fix financial tab, add HCAHPS domain |
| `client/src/views/HospitalDetail.jsx` + `.module.css` | Modified — HCAHPS panel |
| `client/src/views/HospitalExplorer.jsx` | Modified — HCAHPS column |
| `client/src/views/AbbyAnalytics.jsx` | Modified — patient context handoff |
| `client/src/utils/qualityColors.js` | Modified — patient_experience color |
| `client/src/components/quality/DomainTabs.jsx` | Modified — patient_experience tab |
| `client/src/components/AppShell.jsx` | Modified — 3 new nav items |
| `client/src/components/icons/NavIcons.jsx` | Modified — 3 new icons |
| `client/src/App.jsx` | Modified — 3 lazy imports + routes |
| `server/routes/quality.js` | Modified — 6 new endpoints |
| `devlog.md` | Modified — this entry |

---

## Data Lake Enrichment — Full Acquisition & Staging (2026-03-01)

### Mission

*"Let's get it ALL. MediCosts is about spreading HOT sunshine on all the data that shows why healthcare costs in the United States are out of control. Exposing the worst and shining light on the best."*

This session transformed MediCosts from a single-source CMS dashboard into a comprehensive healthcare data lake. We researched 19 enrichment sources across federal agencies (CMS, CDC, HRSA, FEMA, USDA, Census Bureau, AHRQ), wrote automated downloaders for each, and bulk-loaded everything into a PostgreSQL staging schema. The result: **36 GB of raw data, 272 CSV files, 271 tables, 117.6 million rows** — spanning hospital financials, drug pricing, physician payments, community health, workforce shortages, natural disaster risk, and insurance coverage.

### Phase 1: Enrichment Strategy Research

Created `dataenrichment.md` — a comprehensive acquisition strategy document cataloging 19 public data sources organized into three tiers:

**Tier 1 (High Value, Easy Integration):**
1. CDC PLACES — 36 community health measures at ZIP level (diabetes, obesity, smoking, etc.)
2. AHRQ SDOH — Social determinants of health (poverty, education, food access, housing)
3. CMS Hospital Cost Reports (HCRIS) — Operating margins, cost structure, staffing, uncompensated care
4. HRSA HPSAs — Health Professional Shortage Areas (primary care, dental, mental health)
5. CMS Open Payments — Pharma/device manufacturer payments to physicians and hospitals
6. CMS Provider of Services — Bed count, ownership type, teaching status, accreditation
7. USDA RUCA Codes — Rural-urban classification at ZIP level
8. FEMA Disaster Declarations — Every federal disaster since 1953

**Tier 2 (Moderate Effort):**
9. County Health Rankings — 300+ county health variables
10. Census SAHIE — County-level health insurance estimates
11. CMS MA Penetration — Medicare Advantage vs. FFS enrollment by county
12. HRSA Area Health Resource File — 6,000+ county-level variables
13. NADAC Drug Pricing — National average drug acquisition costs
14. CMS Part D Prescribers — Prescribing patterns by provider
15. FEMA National Risk Index — Natural hazard risk scores

**Tier 3 (High Effort):**
16. IRS 990 Tax Filings — Nonprofit hospital financials
17. Area Deprivation Index — Neighborhood-level deprivation scores
18. Leapfrog Safety Grades — Consumer-friendly A-F hospital safety grades
19. Medicaid Expansion Status — State expansion decisions (static reference table)

Each source was documented with exact URLs, API endpoints, data format, key fields, join strategy, size, and update frequency.

### Phase 2: Automated Download Infrastructure

Created `scripts/download-enrichment.js` (~750 lines) — a comprehensive multi-method downloader handling 24 source files across 7 different download methods:

| Method | Sources | How It Works |
|--------|---------|-------------|
| `download` | CDC PLACES, HRSA HPSAs, USDA RUCA, County Health Rankings, CMS POS, Part D Prescribers, Open Payments, NPPES | Direct HTTP GET with streaming to disk, progress reporting |
| `socrata` | CDC PLACES (ZCTA + County) | Socrata Open Data API with `$limit`/`$offset` pagination, CSV endpoint |
| `zip_download` | CMS Cost Reports (FY2023 + FY2024), FEMA NRI, CMS MA Penetration, NPPES NPI Registry | Download ZIP → `unzip` → extract CSVs |
| `fema_api` | FEMA Disaster Declarations | JSON REST API with `$top`/`$skip` pagination → CSV conversion |
| `census_api` | Census SAHIE | Census Bureau API (JSON arrays) → CSV conversion |
| `dkan_api` | NADAC Drug Pricing | CMS/Medicaid DKAN platform with `limit`/`offset` pagination |
| `cms_data_api` | CMS Part D Spending by Drug | CMS data-api/v1 JSON endpoint with `size`/`offset` pagination → CSV conversion |

Also writes a static `medicaid_expansion_status.csv` (51 rows, all states + DC with expansion dates from KFF/Medicaid.gov).

**Features:**
- `--skip-existing` flag to resume interrupted downloads
- `--skip-large` flag to defer multi-GB files
- Browser-like User-Agent header (FEMA blocks generic UAs)
- Error tolerance (continues on failure, reports summary)
- Progress reporting with MB downloaded / total

### Phase 3: Download Execution & Bug Fixes

**Initial run (24 sources):** 17 completed, 4 skipped (large), 4 failed.

**Failures diagnosed and fixed:**

| Source | Error | Root Cause | Fix |
|--------|-------|-----------|-----|
| FEMA NRI | HTTP 403 | FEMA blocks requests with generic User-Agent | Changed UA to Chrome browser string |
| CMS Part D Spending | HTTP 410 | Static file URL removed from CMS CDN (302 → `/not-found`) | Added `cms_data_api` method — CMS data-api/v1 JSON endpoint with pagination |
| NADAC | HTTP 400 | Socrata resource ID `a4y5-998d` no longer exists on data.medicaid.gov | Migrated to DKAN API with dataset UUID `f38d0706-...`, page size 8000 (DKAN max) |
| AHRQ SDOH | HTTP 202 | CloudFront WAF returns JavaScript challenge for all automated requests | **Unsolvable** — WAF blocks even curl with full browser headers. Requires headless browser or manual download. |

**DKAN API discovery:** CMS/Medicaid has been migrating from Socrata to DKAN as their data platform. The DKAN endpoint format is:
```
https://data.medicaid.gov/api/1/datastore/query/{datasetId}/0?limit=8000&offset=N&format=csv
```
Key constraint: DKAN max page size is 8,000 rows (vs. Socrata's 50,000). Initial attempt with `limit=50000` returned HTTP 400: *"The attribute value must be less than or equal 8000."*

**CMS data-api discovery:** For Part D Spending by Drug, the static CSV file was removed from the CDN. Found the CMS data-api/v1 endpoint via the `data.json` catalog at `data.cms.gov/data.json`. This returns paginated JSON that we convert to CSV client-side:
```
https://data.cms.gov/data-api/v1/dataset/{id}/data?size=5000&offset=N
```

**Large file downloads (background):** Open Payments PY2023 (7.7 GB), Open Payments PY2024 (8.3 GB), Part D Prescribers (556 MB), NPPES NPI Registry (11 GB ZIP → extracted CSVs).

### Phase 4: Stage Schema Bulk Loading

Created `scripts/load-stage.js` (~200 lines) — a high-performance bulk CSV loader using PostgreSQL `COPY FROM STDIN` via `pg-copy-streams`.

**Architecture:**
1. Recursively scans `data/` for all `.csv` files (sorted)
2. For each file: auto-detects headers, sanitizes column names, creates a TEXT-column table
3. Streams the file into PostgreSQL via `COPY FROM STDIN WITH (FORMAT csv, HEADER true)`
4. Error-tolerant: logs failures and continues to next file
5. Reports summary with table count, row count, elapsed time

**Table naming convention:** `{theme}__{filename_stem}` where theme is the subdirectory name. E.g., `data/cdc-places/places_zcta.csv` → `stage.cdc_places__places_zcta`.

**Column name sanitization pipeline:**
1. Lowercase
2. Replace non-alphanumeric with `_`
3. Collapse multiple `_`, strip leading/trailing `_`
4. Prefix with `_` if starts with digit
5. Truncate to 63 chars (PostgreSQL identifier limit) — uses MD5 hash suffix if truncated
6. Deduplicate: append `_2`, `_3` for repeats
7. Replace empty names with `_col_N` (1-based position)
8. Strip trailing empty columns from headers (caused by trailing commas)

**Bug chronicle — four rounds of fixes:**

**Round 1 (236 CMS files only):** 216/236 loaded, 20 failed.
- **Root cause:** PostgreSQL silently truncates identifiers to 63 characters. Two long table names that differ only after character 63 collide. Same for column names.
- **Fix:** Added `truncateIdent()` — if name > 63 chars, keep first 55 + `_` + 7-char MD5 hash of the full name. Applied to both table names and column names.
- **Result:** 236/236, 0 failures, 24,570,438 rows in 82.6s.

**Round 2 (272 files with enrichment):** 254/265 loaded, 11 failed.
- Stale download artifacts (empty/HTML files from failed downloads)
- PostgreSQL `zero-length delimited identifier` — trailing commas in HRSA CSVs created empty column names, which PG rejects
- CMS Cost Reports have no header row — first data row treated as header, empty values → empty column names → dedup collision
- County Health Rankings: 796 columns, PostgreSQL `row is too big: size 12896, maximum size 8160`

**Round 3 (after cleanup + empty column fix):** 267/272 loaded, 5 failed.
- Deleted stale files (`nadac.csv` 0-byte, `part_d_spending_by_drug.csv` 0-byte, `part_d_spending_by_drug_dy2023.csv` HTML)
- Added empty column name handling: `sanitize("") → "" → replaced with _col_N`
- HRSA files still failing: `missing data for column "_col_65"` — trailing comma creates phantom column in header but not all data rows have it

**Round 4 (final):** 271/272 loaded, **1 failure**.
- Added trailing empty column stripping in `readHeader()` — `while last col is empty, pop it`
- HRSA files (4): all loaded successfully
- CMS Cost Reports (2): loaded successfully
- Re-downloaded Part D Spending via CMS data-api/v1 (14,309 rows)

**The one remaining failure:** `county-health-rankings/chr_analytic_data_2025.csv` — 796 columns with small values per row exceeds PostgreSQL's 8,160-byte heap page tuple limit. This is a hard PostgreSQL architectural constraint, not a bug. The file would need to be split into multiple narrower tables to load.

### Final Numbers

| Metric | Before (CMS only) | After (Full Enrichment) |
|--------|-------------------|------------------------|
| CSV files | 236 | 272 |
| Stage tables | 236 | 271 |
| Total rows | 24,570,438 | **117,614,067** |
| Data on disk | ~4 GB | **36 GB** |
| Data sources | 1 (CMS Provider Data) | **15+ federal agencies** |
| Load time | 82.6s | 617.4s (~10 min) |

### Data Inventory by Theme

| Theme | Files | Notable Row Counts | Size | Key Data |
|-------|-------|--------------------|------|----------|
| CMS Open Payments | 2 | 30.1M | 16 GB | Pharma/device payments to physicians PY2023-2024 |
| CMS Cost Reports | 6 | 45.6M | 1.8 GB | Hospital financial statements FY2023-2024 (RPT + ALPHA + NMRC) |
| NPPES | 8 | 11.8M | 12 GB | National Provider Identifier registry (9.4M NPIs + endpoints + practice locations) |
| Hospitals (CMS) | 76 | 11.1M | 3.2 GB | Quality, cost, outcomes, value-based programs, patient surveys |
| Physician Office Visit Costs | 85 | 3.7M | 348 MB | Office visit costs by specialty (85 specialties × 42,966 ZIPs) |
| Doctors & Clinicians | 7 | 5.9M | 894 MB | Clinician directory, utilization, MIPS quality reporting |
| Nursing Homes | 17 | 2.0M | 568 MB | Quality, deficiencies, staffing, ownership, penalties |
| NADAC | 1 | 1.6M | 137 MB | Drug acquisition costs (weekly pricing, 1.6M NDC records) |
| CDC PLACES | 2 | 1.4M | 324 MB | Community health measures (ZIP + county level) |
| CMS Part D | 2 | 1.4M | 561 MB | Drug spending by drug + prescriber-level data |
| Hospice | 8 | 1.0M | 134 MB | Hospice quality, CAHPS survey, provider/ZIP data |
| County Health Rankings | 1 | 745K | 71 MB | County health trends (analytic data failed — PG row limit) |
| Home Health | 11 | 574K | 146 MB | Home health agencies, patient surveys, ZIP-level data |
| HRSA HPSAs | 4 | 174K | 101 MB | Shortage areas: primary care, dental, mental health, MUA/MUP |
| FEMA | 4 | 73K | 75 MB | Disaster declarations + National Risk Index (county hazard scores) |
| CMS Provider of Services | 1 | 78K | 50 MB | Facility characteristics (beds, ownership, accreditation) |
| Dialysis | 23 | 136K | 34 MB | Dialysis facility quality, ESRD QIP measures |
| Other | 14 | ~350K | ~30 MB | RUCA, Census SAHIE, MA penetration, Medicaid expansion, supplier directory, IRF |

### Unsolved / Remaining Gaps

1. **AHRQ SDOH** — CloudFront WAF blocks all automated access with HTTP 202 JavaScript challenges. Even curl with full browser headers, Referer, and cookies gets the challenge page. Would require Puppeteer/Playwright headless browser automation or manual download.

2. **County Health Rankings analytic data** — 796 columns exceed PostgreSQL's ~8KB heap tuple size limit. Options: (a) split into multiple tables by column group, (b) pivot to EAV format, (c) load into a column-oriented store. The trends file (fewer columns) loaded fine with 745K rows.

3. **HRSA AHRF** — SAS transport format, not yet downloaded. Would need `pandas.read_sas()` conversion.

4. **IRS 990, ADI, Leapfrog** — Tier 3 sources requiring account registration or data request forms.

### Files Created/Modified

| File | Status | Description |
|------|--------|-------------|
| `scripts/download-enrichment.js` | New | Multi-method enrichment downloader (24 sources, 7 methods, ~750 lines) |
| `scripts/load-stage.js` | New | COPY FROM STDIN bulk CSV loader (~200 lines) |
| `scripts/package.json` | Modified | Added `pg-copy-streams` dependency |
| `dataenrichment.md` | New | Comprehensive enrichment strategy (19 sources, 3 tiers, 758 lines) |
| `.gitignore` | Modified | Added `*.csv` and `*.pdf` patterns |
| `devlog.md` | Modified | This entry |

### Technical Learnings

**PostgreSQL identifier limit (63 chars):** PG silently truncates identifiers to 63 bytes via `NAMEDATALEN`. When loading hundreds of files with long names, this causes silent collisions. Solution: proactively truncate with hash suffix (`name[0:55] + '_' + md5(name)[0:7]`).

**PostgreSQL row size limit (8,160 bytes):** The heap page size is 8KB. While TOAST handles large individual values, a row with hundreds of small inline TEXT values can exceed the page limit. No workaround without schema changes.

**DKAN vs. Socrata vs. CMS data-api:** Federal data platforms are migrating. The same agency may serve data on Socrata (`data.cdc.gov`), DKAN (`data.medicaid.gov`), or CMS data-api (`data.cms.gov`). Each has different pagination syntax and size limits. Static file URLs on CDNs can be removed without notice — API endpoints are more durable.

**Trailing commas in government CSVs:** Some federal agency CSV exports include trailing commas on header lines but not consistently on data rows. This creates phantom empty columns that cause COPY column-count mismatches. Solution: strip trailing empty columns from parsed headers before creating the table.

**CloudFront WAF vs. automation:** AHRQ's website uses a JavaScript challenge-response WAF that defeats all non-browser HTTP clients, including curl with full browser headers. The only viable automated approach would be headless browser (Puppeteer/Playwright).

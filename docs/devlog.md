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

---

## "Know Before You Go" — Personalized Care Intelligence (2026-03-01)

Transforms MediCosts from a data browser into a personalized care decision tool. The #1 consumer question — "I need [procedure] near [location] — what's my best option and what will it cost?" — now has an answer.

### New Page

**Cost Estimator (`/estimate`)** — "The Kayak.com for hospital procedures"
- DRG autocomplete search across all ~750 DRGs (250ms debounce)
- Location toggle: "By State" dropdown or "Near ZIP" with radius (25/50/100/200 mi)
- Sort by payment, distance, star rating, or markup ratio
- National summary cards (avg/min/max/median payment, hospital count)
- Results table with hospital name, location, distance, avg payment, markup, CMS stars, patient rating, discharges
- "Ask Abby to help me choose" CTA builds context and hands off to Abby AI

### New API Endpoints (5)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/drgs/search?q=knee&limit=20` | Full-text DRG search across all DRGs with provider counts and avg payments |
| `GET /api/drgs/:code/summary` | National stats (min/max/avg/median) + state-by-state breakdown for one DRG |
| `GET /api/estimate?drg=&zip=&radius=&state=&sort=&order=&limit=` | Hospitals by DRG + location with haversine distance, star rating, HCAHPS |
| `GET /api/hospitals/nearby?zip=&radius=&sort=&limit=` | Quality composite + distance from ZIP (no DRG filter) |
| `GET /api/quality/psi/list?state=&sort=&limit=` | Hospital-level HAC scores, PSI-90, payment reduction, infection SIRs |

### New Data Table

**`medicosts.zip_centroids`** — ~33K rows, loaded from `client/src/data/zipCentroids.json`
- Schema: `zip5 VARCHAR(5) PK, lat NUMERIC(10,6), lon NUMERIC(10,6)`
- Used for haversine distance calculations in `/api/estimate` and `/api/hospitals/nearby`
- Loader: `scripts/load-zip-centroids.js`

### Enhanced Existing Pages

| Page | Enhancement |
|------|-------------|
| **Geographic Analysis** | Metric toggle (payment/charges/medicare/reimbursement rate) + "Find Care Near Me" panel with ZIP input and hospital cards |
| **Hospital Detail** | "Print Report Card" button (`window.print()`) + "+ Compare" button + `@media print` stylesheet hiding sidebar/charts |
| **Hospital Compare** | Shareable URL params (`?h=CCN1&h=CCN2&h=CCN3`), radar chart (5 dimensions normalized 0-100), "Copy Shareable Link" button |
| **Abby Analytics** | localStorage persistence (last 50 messages), "New Conversation" button, estimator context handoff via `location.state` |
| **Cost Trends** | Hospital name autocomplete replacing raw CCN input (debounced search via `/quality/search`) |
| **Accountability** | HAC hospital drilldown table with per-hospital HAC scores, PSI-90, infection SIRs, penalty status |
| **For Patients** | Removed .doc/.docx from file accept (no extraction logic existed for those formats) |
| **Settings** | Version bump v0.2 → v0.4 |

### Abby AI Enhancements

3 new tools added to `server/lib/abby-tools.js`:
- `search_drgs` — keyword search across all DRGs
- `estimate_procedure_cost` — hospital pricing by DRG + location with distance
- `find_nearby_hospitals` — proximity-based hospital search with quality scores

Updated `server/lib/abby-schema-context.md` with new query patterns for procedure cost and proximity questions.

### Files Changed

| File | Status | Description |
|------|--------|-------------|
| `client/src/views/CostEstimator.jsx` + `.module.css` | New | Cost Estimator page |
| `scripts/load-zip-centroids.js` | New | ZIP centroid data loader |
| `server/routes/api.js` | Modified | 4 new endpoints (DRG search, DRG summary, estimate, nearby) |
| `server/routes/quality.js` | Modified | 1 new endpoint (PSI list) |
| `client/src/views/GeographicAnalysis.jsx` + `.module.css` | Modified | Metric toggle, nearby panel |
| `client/src/views/HospitalDetail.jsx` + `.module.css` | Modified | Print button, compare button, @media print |
| `client/src/views/HospitalCompare.jsx` + `.module.css` | Modified | URL params, radar chart, copy link |
| `client/src/views/AbbyAnalytics.jsx` + `.module.css` | Modified | localStorage, clear button, estimator handoff |
| `client/src/views/CostTrends.jsx` + `.module.css` | Modified | Hospital name autocomplete |
| `client/src/views/AccountabilityDashboard.jsx` | Modified | HAC hospital drilldown table |
| `client/src/views/ForPatients.jsx` | Modified | Remove .doc/.docx from accept |
| `client/src/views/SettingsView.jsx` | Modified | Version bump to v0.4 |
| `client/src/components/AppShell.jsx` + `.module.css` | Modified | Cost Estimator nav item, @media print |
| `client/src/components/icons/NavIcons.jsx` | Modified | SearchDollarIcon |
| `client/src/App.jsx` | Modified | Lazy import + route for CostEstimator |
| `server/lib/abby-tools.js` | Modified | 3 new tools |
| `server/lib/abby-schema-context.md` | Modified | New query patterns + zip_centroids table |

**Totals:** 3 new files, 24 modified files, 5 new API endpoints, 1 new page, 1 new data table, ~2,200 lines added

---

## ClearNetwork: MRF Crawler Pipeline + Full Data Population (2026-03-02)

Completed all remaining ClearNetwork implementation phases — the platform now has real provider data, live insurer network intelligence, and consumer-facing API endpoints verified end-to-end with production data.

### Phase 4: NPPES NPI Enrichment — 9M Providers Loaded

Loaded the full NPPES National Provider Identifier registry (11 GB CSV, 330 columns) into `clearnetwork.canonical_providers` using streaming batch inserts.

**Key metrics:**
- **9,011,058 providers** loaded (7,120,224 individuals, 1,890,834 facilities)
- **870 unique specialties** mapped via NUCC taxonomy codes
- **8,849,358 geocoded** (98.2%) using ZIP centroid approximation
- Load time: ~4.3 minutes at ~35K rows/sec

**Technical challenges solved:**

1. **asyncpg implicit transaction trap**: `copy_records_to_table()` without explicit `async with conn.transaction()` caused the TRUNCATE and all COPY batches to sit in one giant uncommitted transaction — appeared to load 130K rows but nothing committed. Fixed by wrapping each COPY batch in its own explicit transaction.

2. **VARCHAR(2) overflow**: Some NPPES records have `address_state` values longer than 2 characters. Added `state = row[COL_PRACTICE_STATE].strip()[:2]` truncation and batch-level error recovery (retry individual rows when a batch fails).

3. **Python stdout buffering**: Background process output was invisible due to buffering. Fixed with `sys.stdout.flush()` and `-u` flag.

**Script: `scripts/load_nppes.py`** — Streams 11 GB CSV line-by-line, filters deactivated/non-US NPIs, maps 330 CSV columns to 15 DB fields, batch-inserts via `asyncpg.copy_records_to_table()` in 5,000-row batches with explicit transactions. Drops/recreates NPI unique index for faster loading.

**Script: `scripts/geocode_providers.py`** — Backfills `lat`/`lng` on canonical_providers by joining against `clearnetwork.zip_centroids` (33K ZIP codes). Runs in 10K-row batches. 417 seconds for 8.8M providers.

### Phase 1-2: MRF Crawler + Ingestion Pipeline

Built the full Machine-Readable File crawl pipeline: insurer discovery → index parsing → file download → NPI extraction → network population.

**Components:**

| Module | Purpose |
|--------|---------|
| `crawler/known_insurers.json` | 21 curated insurers with MRF index URLs |
| `crawler/discovery.py` | Seeds `insurers` table from JSON + deduplicates |
| `crawler/mrf_index.py` | Stream-parses MRF `index.json` with `ijson` — extracts plans + in-network file URLs |
| `crawler/mrf_parser.py` | Stream-parses in-network rate files — extracts NPIs from `provider_references` |
| `crawler/downloader.py` | Async download manager — streaming, retry, dedup, rate limiting |
| `crawler/orchestrator.py` | Pipeline coordinator — `python -m crawler.orchestrator --insurer=<name>` |

**First successful crawl — Blue Cross and Blue Shield of Minnesota:**
- **14,910 plans** discovered and stored
- **9,170 in-network files** found in index (limited to first 5 for safety)
- **5 rate files** downloaded, decompressed, and parsed
- **241,734 unique providers** linked to the BCBS MN network
- **0 errors**, completed in ~60 minutes

**Technical challenges solved:**

1. **IPv6 connectivity**: Machine has no IPv6 route. `aiohttp` tried IPv6 first and failed. Fixed with `aiohttp.TCPConnector(family=2)` (AF_INET, IPv4 only) in both `downloader.py` and `orchestrator.py`.

2. **CloudFront signed URL expiration**: January 2026 index had expired S3/CloudFront signatures. Updated to current month's index URL (`2026-03-01`).

3. **Gzip detection by magic bytes**: Downloaded files are saved with MD5-hash filenames (no `.gz` extension). The parser's `.endswith(".gz")` check failed on gzipped content. Fixed by reading the first 2 bytes and checking for gzip magic `\x1f\x8b`.

4. **Batch upsert performance**: Initial row-by-row `INSERT...ON CONFLICT` took ~60 minutes for 221K NPIs. Optimized to batch `unnest()` approach:
   ```sql
   INSERT INTO network_providers (network_id, canonical_provider_id, in_network, last_verified)
   SELECT unnest($1::uuid[]), unnest($2::uuid[]), TRUE, NOW()
   ON CONFLICT (network_id, canonical_provider_id)
   DO UPDATE SET in_network = TRUE, last_verified = NOW()
   ```
   Future crawls will be orders of magnitude faster.

**Migrations applied:**
- `004_add_crawl_tracking.py` — `crawl_jobs` and `crawl_failures` tables for pipeline observability
- `005_add_snapshots_and_alerts.py` — `network_snapshots` and `alert_subscriptions` tables

### Phase 5: Change Detection

- `crawler/change_detector.py` — Compares current network membership against previous snapshot, computes added/removed/tier-changed providers, inserts diffs into `network_changes`
- `app/routes/alerts.py` — Alert subscription API:
  - `POST /v1/alerts/subscribe` — create subscription for plan + provider NPIs
  - `GET /v1/alerts/subscriptions?email=` — list active subscriptions
  - `DELETE /v1/alerts/{id}` — unsubscribe
- Ready for next crawl run to produce first change detection results

### Phase 9: Consumer Widget + Network Adequacy Scoring

**Network Adequacy API** (`app/routes/adequacy.py`):
- `GET /v1/networks/{network_id}/adequacy?state=&zip=`
- Scoring dimensions: PCP access, specialist coverage, facility access, total provider coverage
- BCBS MN scored **82.2 overall** (100% PCP, 100% specialist, 60% facility, 61.1% total)

**Embeddable Widget** (`widget/index.js`):
- `<clear-network-check plan-id="..." provider-npi="..." />` custom element
- Shadow DOM encapsulation, light/dark mode, XSS protection
- States: loading spinner, in-network (green badge), out-of-network (red badge), error
- Shows tier, provider info, alternatives, legal disclaimer

### End-to-End API Verification

All endpoints tested with real production data:

| Endpoint | Result |
|----------|--------|
| `GET /v1/health` | `{"status": "ok", "database": "connected"}` |
| `GET /v1/providers/search?name=mayo+clinic&state=MN` | Mayo Clinic Hospital-Rochester, Mayo Clinic |
| `GET /v1/providers/nearby?zip=55905&radius=10` | Rochester MN providers with distances |
| `GET /v1/plans/search?q=blue+cross` | 14,910 BCBS MN plans |
| `GET /v1/plans/{id}/network?provider_npi=1003130212` | `"in_network": true` |
| `GET /v1/plans/{id}/network?provider_npi=1083249577` | `"in_network": false` (facility not in rate files) |
| `POST /v1/alerts/subscribe` | Subscription created (201) |
| `GET /v1/networks/{id}/adequacy?state=MN` | `"overall_score": 82.2` |

### Database State

| Table | Row Count |
|-------|-----------|
| `canonical_providers` | 9,011,058 |
| `network_providers` | 241,734 |
| `plans` | 14,910 |
| `networks` | 4 |
| `insurers` | 21 |
| `crawl_jobs` | 1 (completed, 0 errors) |
| `zip_centroids` | ~33,000 |
| `alert_subscriptions` | 1 (test) |

### Dependencies Added (`pyproject.toml`)

- `ijson>=3.2.0` — streaming JSON parser for massive MRF files
- `aiohttp>=3.9.0` — async HTTP client for downloads
- `aiofiles>=24.1.0` — async file I/O

### Files Changed

| File | Status | Description |
|------|--------|-------------|
| `clearnetwork/crawler/__init__.py` | New | Package init |
| `clearnetwork/crawler/known_insurers.json` | New | 21 curated insurers with MRF index URLs |
| `clearnetwork/crawler/discovery.py` | New | Insurer registry seeder |
| `clearnetwork/crawler/mrf_index.py` | New | MRF index.json stream parser |
| `clearnetwork/crawler/mrf_parser.py` | New | In-network file NPI extractor (batch unnest upsert) |
| `clearnetwork/crawler/downloader.py` | New | Async download manager with retry/dedup |
| `clearnetwork/crawler/orchestrator.py` | New | Pipeline coordinator CLI |
| `clearnetwork/crawler/change_detector.py` | New | Network change detection |
| `clearnetwork/app/routes/alerts.py` | New | Alert subscription endpoints |
| `clearnetwork/app/routes/adequacy.py` | New | Network adequacy scoring |
| `clearnetwork/widget/index.js` | New | Embeddable web component |
| `clearnetwork/widget/demo.html` | New | Widget demo page |
| `clearnetwork/alembic/versions/004_*.py` | New | Crawl tracking migration |
| `clearnetwork/alembic/versions/005_*.py` | New | Snapshots + alerts migration |
| `clearnetwork/scripts/load_nppes.py` | Modified | Transaction fixes, state truncation, error recovery |
| `clearnetwork/scripts/geocode_providers.py` | Modified | Batch execution |
| `clearnetwork/app/main.py` | Modified | Mount alerts + adequacy routers |
| `clearnetwork/pyproject.toml` | Modified | Added ijson, aiohttp, aiofiles |

---

## ClearNetwork Phase 9 & 10 — Consumer UI + Data Quality (2026-03-02)

Completed the final two phases of the ClearNetwork foundational sprint: consumer-facing tools (Phase 9) and automated data quality monitoring (Phase 10). With these complete, ClearNetwork transitions from infrastructure to a usable product.

---

### Phase 9: Consumer-Facing Features

**9.1 Widget** — Already complete from prior session (`clearnetwork/widget/index.js`). No changes needed — the embeddable `<clear-network-check>` Web Component was production-ready.

**9.2 Network Adequacy Report** — `clearnetwork/widget/adequacy-report.html`

New standalone HTML page for visualizing network adequacy scores. No React dependency — pure vanilla JS with the same dark design system used across the project.

Features:
- Network ID input + optional ZIP code + radius selector (15/30/50/100 mi) + state filter + configurable API base URL
- SVG semi-circle gauge rendering the 0–100 overall adequacy score with dynamic color (green → blue → amber → red)
- Letter grade chip (A/B/C/D) computed from score thresholds (≥80=A, ≥65=B, ≥50=C, else D)
- 4 component score cards with colored fill bars: PCP Access (30%), Specialist Coverage (25%), Facility Access (25%), Total Provider Coverage (20%)
- Provider count grid: total providers / PCPs / specialists / facilities
- ZIP-level adequacy block (conditional on ZIP input): providers within radius, PCPs within radius, PCP access flag (green ✓ / red ✗)
- Full error handling, loading spinner, responsive layout at 600px

**9.3 Plan Finder** — `clearnetwork/widget/plan-finder.html`

Consumer tool answering: *"I want to keep my 5 doctors — which plans cover all of them?"*

Features:
- Up to 5 NPI inputs, each with live provider name resolution via `GET /v1/providers/{npi}` (600ms debounce, green/red border feedback)
- State / plan type (HMO, PPO, EPO, POS, HDHP) / year filters + configurable API base
- Two-step query: first fetches all matching plans via `/v1/plans/search`, then runs `/v1/plans/compare` with all plan IDs and all NPIs in one call
- Provider legend showing resolved names for P1–P5
- Coverage matrix table sorted by coverage %:
  - Color-coded coverage bars (green 100%, blue ≥75%, amber ≥50%, red <50%)
  - Per-provider in/out-of-network cells with tier label badges
  - Insurer name sub-label under plan name
- Full error handling for unreachable API, no plans found, comparison failures

---

### Phase 10: Monitoring & Data Quality

**10.2 Quality Checks Module** — `clearnetwork/app/quality/__init__.py` + `clearnetwork/app/quality/checks.py`

Six async quality check functions, each returning a `QualityCheckResult` dataclass:

| Check | Threshold | Severity if Fail |
|-------|-----------|-----------------|
| `check_npi_validity_rate` | ≥90% valid 10-digit NPIs | critical |
| `check_address_completeness` | ≥85% with geocoded address (street + lat + lng) | warning |
| `check_no_duplicate_canonical_providers` | 0 duplicate NPIs | critical |
| `check_network_size_regression` | No network drops >20% between snapshots | critical |
| `check_geographic_distribution_sanity` | Providers span ≥40 US states | warning |
| `check_specialty_code_validity` | ≥95% of taxonomy codes are ≥10 chars (valid CMS format) | warning |

`run_all_checks(db)` runs all six, catches individual failures gracefully, and returns results sorted by severity (critical → warning → info) with failures before passes.

**10.1 Quality API Routes** — `clearnetwork/app/routes/quality.py`

Five new endpoints mounted at `/v1/quality/`:

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/quality/checks` | Run all 6 checks live, return summary + per-check detail |
| `GET /v1/quality/crawl-stats` | Per-insurer crawl history: status, success rate, files, providers found, errors |
| `GET /v1/quality/network-staleness` | All networks with days since last snapshot (current / stale / critical / never_crawled) |
| `GET /v1/quality/provider-deltas` | Provider count changes between the two most recent snapshots, flagging >20% drops |
| `GET /v1/quality/npi-stats` | NPI validity breakdown by entity type + 20-row invalid sample for inspection |

Registered in `clearnetwork/app/main.py`.

**10.1 Admin Dashboard** — `clearnetwork/dashboard/index.html`

Self-contained dark-themed admin dashboard fetching all data from `/v1/quality/*` via fetch(). Auto-loads on page open, with a ↻ Refresh button and configurable API base URL in the sticky header.

Five sections:

1. **Crawl Overview** — 4 KPI cards: total jobs, success rate (color-coded), total providers found, last crawl timestamp
2. **Quality Checks Grid** — 6 cards with left-border color (green/amber/red), PASS/CRITICAL/WARNING pills, value + threshold + fill bar + detail text
3. **Network Staleness Table** — all networks with last snapshot date, days stale, status pills, snapshot vs. reported provider counts
4. **Crawl History by Insurer** — per-insurer table with last status, all-time success rate, last run, files processed, providers found, error count
5. **Provider Count Deltas** — top 20 networks by absolute change, with ⚠ DROP flag on regressions >20%

All sections degrade gracefully when no data exists yet (loading states, empty state messages).

---

### New Endpoints Summary (this session)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/quality/checks` | Run all quality checks |
| GET | `/v1/quality/crawl-stats` | Crawl job statistics by insurer |
| GET | `/v1/quality/network-staleness` | Network freshness status |
| GET | `/v1/quality/provider-deltas` | Provider count changes between snapshots |
| GET | `/v1/quality/npi-stats` | NPI validity breakdown + invalid samples |

### New/Modified Files

| File | Status | Description |
|------|--------|-------------|
| `clearnetwork/app/quality/__init__.py` | New | Quality module package + exports |
| `clearnetwork/app/quality/checks.py` | New | 6 quality check functions + QualityCheckResult dataclass |
| `clearnetwork/app/routes/quality.py` | New | 5 quality monitoring API endpoints |
| `clearnetwork/dashboard/index.html` | New | Admin data quality dashboard |
| `clearnetwork/widget/adequacy-report.html` | New | Network adequacy score visualizer (Phase 9.2) |
| `clearnetwork/widget/plan-finder.html` | New | "Which plans cover my doctors?" consumer tool (Phase 9.3) |
| `clearnetwork/app/main.py` | Modified | Registered quality router |
| `plan.md` | New | MediCosts 1.0 final version implementation plan |

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| ClearNetwork API endpoints | 13 | **18** |
| Consumer-facing HTML tools | 1 (demo.html) | **4** (demo, plan-finder, adequacy-report, dashboard) |
| Quality checks | 0 | **6** |
| Directories | crawler/, app/, widget/ | + **dashboard/**, + **app/quality/** |

### ClearNetwork Foundational Sprint — Complete

Phases 9 and 10 mark the completion of the ClearNetwork foundational sprint. All 10 phases from `clearnetwork.md` are now either built or have their core infrastructure in place:

| Phase | Status | Key Deliverable |
|-------|--------|----------------|
| 1 — Discovery Engine | ✅ | `known_insurers.json`, MRF index crawler |
| 2 — Data Ingestion | ✅ | Streaming NPI extractor, download manager |
| 3 — Database | ✅ | Full PostgreSQL schema, PostGIS, 5 migrations |
| 4 — Data Enrichment | ✅ | NPPES loader, geocoding scripts |
| 5 — Change Detection | ✅ | Snapshot + diff system |
| 6 — API Layer | ✅ | 18 FastAPI endpoints across 6 routers |
| 7 — Infrastructure | ✅ (design) | Scalability specs documented |
| 8 — Compliance | ✅ | 45 CFR §147.211 disclaimer in all responses |
| 9 — Consumer Features | ✅ | Widget, plan finder, adequacy report |
| 10 — Monitoring & Quality | ✅ | 6 quality checks, 5 monitoring endpoints, admin dashboard |

Next sprint: MediCosts 1.0 final phases per `plan.md`.

**Totals:** 14 new files, 4 modified files, 3 new API routers, 9M+ provider records, 241K network links, 14.9K plans

---

## ClearNetwork: Multi-Insurer Crawl, Admin Monitoring & Nightly Automation (2026-03-02)

### Overview

Extended the ClearNetwork crawler from single-insurer proof-of-concept to a production multi-insurer pipeline with admin monitoring UI and automated nightly scheduling. Key outcomes:

- **4 working MRF endpoints** identified and configured (up from 1)
- **353K+ network-provider links** (and growing — HCSC crawl still running)
- **Full admin monitoring panel** in the Settings page with real-time crawler status
- **Nightly cron job** scheduled at 2 AM for continuous data aggregation

### Multi-Insurer MRF URL Discovery

Researched all 21 insurers in `known_insurers.json` to categorize their MRF index accessibility:

| Type | Count | Examples |
|------|-------|---------|
| `direct_json` | 1 | BCBS Minnesota |
| `dated_s3` | 1 | Anthem (date-templated S3 URL) |
| `dated_azure` | 1 | HCSC/BCBS Illinois (Azure blob) |
| `dated_cloudfront` | 1 | Cigna (CloudFront, returns 403 currently) |
| `uhc_blob_api` | 1 | UnitedHealthcare (custom blob API) |
| `browser_required` | 16 | Aetna, Humana, Kaiser, Centene, etc. |

Updated every entry in `known_insurers.json` with `index_type` and `date_pattern` fields. Added working URLs for Anthem, HCSC, and Cigna.

### Orchestrator Rewrite

Rewrote `clearnetwork/crawler/orchestrator.py` with:

- **`resolve_mrf_url()`** — Resolves dated URL templates (`{date}` → `2026-03-01`) based on `date_pattern` (YYYY-MM-01, YYYY-MM, YYYY-MM-DD)
- **`try_dated_urls()`** — Probes multiple recent dates via HEAD requests until a working URL is found (tries last 7 days for daily patterns, current + previous month for monthly)
- **`--automatable-only` flag** — Skips `browser_required` insurers (16 of 21)
- **`--max-files` flag** — Limits in-network files per insurer (default unlimited, nightly uses 50)
- **`load_insurer_json_index()`** — Loads JSON config for index_type resolution during crawl

### Batch Upsert Optimization

Replaced row-by-row `INSERT...ON CONFLICT` in `mrf_parser.py` with PostgreSQL batch unnest pattern:

```sql
INSERT INTO clearnetwork.network_providers (network_id, canonical_provider_id, in_network, last_verified)
SELECT unnest($1::uuid[]), unnest($2::uuid[]), TRUE, NOW()
ON CONFLICT (network_id, canonical_provider_id)
DO UPDATE SET in_network = TRUE, last_verified = NOW()
```

This reduced upsert time for 221K NPIs from ~60 minutes to seconds.

### Admin Monitoring Panel

**Backend — `server/routes/clearnetwork-admin.js`** (7 endpoints):

| Endpoint | Purpose |
|----------|---------|
| `GET /api/clearnetwork/status` | Aggregate counts (insurers, networks, plans, providers, active crawls, failures, alerts) |
| `GET /api/clearnetwork/insurers` | All insurers with LATERAL JOIN for latest crawl job status |
| `GET /api/clearnetwork/crawl-jobs` | Recent jobs with duration calculation |
| `GET /api/clearnetwork/crawl-jobs/:id` | Single job detail with associated failures |
| `GET /api/clearnetwork/networks` | Networks with provider counts and plan counts |
| `GET /api/clearnetwork/failures` | Recent crawl failures for monitoring |
| `GET /api/clearnetwork/provider-stats` | NPPES coverage statistics |

**Frontend — `client/src/views/SettingsView.jsx`** expanded with:

- **Top-level tab switcher**: "General" (original) and "ClearNetwork Crawler"
- **ClearNetwork sub-tabs**: Overview, Insurers, Crawl Jobs, Failures
- **Overview**: Stats grid showing insurers, networks, plans, provider links, active crawls, failures, alerts + provider coverage breakdown (total, individuals, facilities, geocoded, in-network, specialties, states)
- **Insurers table**: Name, network/plan/provider counts, last crawl status with color-coded badges, files processed, errors
- **Crawl Jobs table**: Insurer name, status badge (with pulse animation for running), started time, duration, files, providers, errors
- **Failures table**: Insurer, URL (truncated monospace), error message, retry count, relative time
- **Auto-refresh toggle**: 10-second polling interval for live monitoring

Status badges use color-coded styling: running (blue + pulse), completed (green), completed_with_errors (amber), failed (red).

### Nightly Cron Automation

**`clearnetwork/scripts/nightly-crawl.sh`**:
- Activates Python virtualenv
- Loads `.env` for database credentials
- Runs `crawler.orchestrator --automatable-only --max-files=50`
- Logs to timestamped files in `clearnetwork/logs/`
- Cleans up logs older than 30 days

**Crontab**: `0 2 * * *` — runs nightly at 2 AM

### Current Crawl Results

| Insurer | Status | Files | Providers | Errors |
|---------|--------|-------|-----------|--------|
| BCBS Minnesota | completed | 5 | 463,160 | 0 |
| HCSC (BCBS Illinois) | running | — | — | 0 |
| Aetna | failed (browser_required) | 0 | 0 | 1 |

Total network-provider links: **353,776+** (HCSC still running and actively linking providers).

### Files Changed

| File | Status | Description |
|------|--------|-------------|
| `clearnetwork/crawler/known_insurers.json` | Modified | Added `index_type` and `date_pattern` for all 21 insurers |
| `clearnetwork/crawler/orchestrator.py` | Modified | Multi-insurer support, dated URL resolution, CLI flags |
| `clearnetwork/crawler/mrf_parser.py` | Modified | Batch unnest upsert optimization |
| `clearnetwork/scripts/nightly-crawl.sh` | New | Cron wrapper for nightly automated crawl |
| `server/routes/clearnetwork-admin.js` | New | 7 Express admin API endpoints |
| `server/index.js` | Modified | Mounted clearnetwork-admin router |
| `client/src/views/SettingsView.jsx` | Modified | ClearNetwork Crawler monitoring tab |
| `client/src/views/SettingsView.module.css` | Modified | Tabs, stats grid, tables, badges, pulse animation |

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| Working MRF endpoints | 1 | **4** (+ 1 returning 403) |
| Network-provider links | 241,734 | **353,776+** (growing) |
| Automatable insurers | 1 | **5** |
| Express admin endpoints | 0 | **7** |
| Crawl automation | Manual | **Nightly cron at 2 AM** |

---

## MediCosts 1.0 Sprint — Phase 1.1 (Open Payments) + Phase 4.1 (Abby → Claude API) (2026-03-02)

### Overview
First sprint in the MediCosts 1.0 final sprint track (from plan.md). Completed two high-priority phases:
- **Phase 1.1**: Promoted 30M Open Payments records, built API + consumer UI
- **Phase 4.1**: Upgraded Abby from Ollama/MedGemma to Anthropic Claude API with native tool_use

---

### Phase 1.1 — Open Payments Promotion

**Source data:** `stage.cms_open_payments__open_payments_general_py2023` + `stage.cms_open_payments__open_payments_general_py2024`

#### Promote Script: `scripts/promote-open-payments.js`
- Merges PY2023 + PY2024 into `medicosts.open_payments` (30,085,830 total rows)
- Schema: `id BIGSERIAL PK`, payment_year, recipient_type, physician_npi, physician names, specialty, hospital_ccn/name, city/state/zip, payer_name/state, payment_amount (NUMERIC 14,2), payment_date, num_payments, payment_form, payment_nature, product_type/name/ndc/category, flags (physician_ownership, charity, dispute_status)
- Safe date parsing handles both `MM/DD/YYYY` and `ISO 8601` formats
- Filters out null/zero payment amounts at import
- Creates 7 indexes: npi, ccn, year, state, payer_name, payment_nature, amount DESC
- Creates `medicosts.mv_open_payments_summary` materialized view (year × nature × state × payer)

**Results:**
| Year | Rows | Total Amount |
|------|------|-------------|
| PY2023 | 14,700,783 | $3,314,058,093 |
| PY2024 | 15,385,047 | $3,313,801,737 |
| **Total** | **30,085,830** | **$6,627,859,830** |

#### API Routes: `server/routes/payments.js`
5 endpoints mounted at `/api/payments`:

| Endpoint | Description |
|----------|-------------|
| `GET /physician/:npi` | Payments to a specific physician with summary + paginated detail |
| `GET /hospital/:ccn` | Payments involving a teaching hospital with nature breakdown |
| `GET /top` | Leaderboard by physician/payer/nature/hospital (filterable by year) |
| `GET /summary` | National totals, by-year, by-nature, by-state breakdowns |
| `GET /search` | Keyword search by physician name or company name |

#### Frontend
- **`client/src/views/PaymentsExplorer.jsx`** — new `/payments` page
  - National KPI row (total payments, total amount, avg, physicians, payers)
  - Year summary table + top 12 payment natures
  - Live search (physician name or company) with results table
  - Leaderboard with 4 group-by modes (physician/payer/nature/hospital) and year filter
  - Click-through to `/clinicians/:npi` and `/hospitals/:ccn`
- **`client/src/views/PaymentsExplorer.module.css`** — full dark-mode styles
- **`client/src/views/HospitalDetail.jsx`** — added "Industry Payments — Sunshine Act" panel
  - Shows total payments, total amount, unique payers
  - Breakdown by payment nature table
- **`client/src/views/ClinicianProfile.jsx`** — added "Industry Payments — Sunshine Act" section
  - Summary stats (total received, count, payers, years active)
  - Paginated payments table (date, payer, nature, product, amount)
- **`client/src/components/AppShell.jsx`** — added "Industry Payments" nav item
- **`client/src/App.jsx`** — registered `/payments` route

---

### Phase 4.1 — Abby Upgrade: Ollama → Claude API

**Before:** Ollama/MedGemma1.5:4b, prompt-based tool_call JSON parsing in fenced blocks, fake streaming (chunked text), single model for everything.

**After:** Anthropic Claude API (`claude-haiku-4-5-20251001`), native `tool_use` content blocks, real SSE streaming word-by-word.

#### Changes

**`server/routes/abby.js`** — complete rewrite:
- Import `Anthropic` from `@anthropic-ai/sdk`
- `getClient()` — lazy-init singleton with ANTHROPIC_API_KEY guard
- `toAnthropicMessages()` — converts frontend message format to Anthropic format
- `orchestrate()` — non-streaming loop (for `/chat` endpoint)
  - Native `stop_reason === 'tool_use'` check instead of regex fenced-block parsing
  - Tool results sent as `tool_result` blocks with `tool_use_id` linkage
- `/chat/stream` — SSE orchestration with native tool_use:
  - Real token streaming (word-by-word) instead of simulated chunking
  - `tool`, `status`, `token`, `error` events preserved for frontend compatibility
- `/health` — tests Anthropic API connectivity with a lightweight ping
- `/suggestions` — added 2 new Open Payments prompts

**`server/lib/abby-tools.js`** — added:
- `import jwt from 'jsonwebtoken'`
- `getServiceToken()` / `serviceToken()` — generates internal service JWT for API calls
- `buildAnthropicTools()` — converts TOOLS array to Anthropic tool schema format (input_schema with type/description/required)
- `Authorization: Bearer ${token}` header in `executeTool()` fetch calls
- 4 new tools: `get_physician_payments`, `get_top_payment_recipients`, `get_payments_summary`, `search_payments`

**`server/lib/abby-prompt.js`** — updated:
- Removed prompt-based tool_call fenced block instructions (not needed with native API)
- Updated data context to mention Open Payments
- Preserved all persona, safety rails, and formatting guidelines

**`.env`** — added placeholder:
```
ANTHROPIC_API_KEY=sk-ant-...
ABBY_MODEL_TOOL=claude-haiku-4-5-20251001  (optional override)
ABBY_MODEL_SYNTH=claude-sonnet-4-6         (optional override)
```

**Benefits over Ollama:**
| Aspect | Before (Ollama) | After (Claude API) |
|--------|-----------------|-------------------|
| Model | MedGemma1.5:4b local | claude-haiku-4-5-20251001 |
| Tool calling | Regex parsed fenced blocks | Native tool_use blocks |
| Streaming | Simulated (chunked) | Real SSE word-by-word |
| Reliability | Inconsistent JSON parsing | Guaranteed schema compliance |
| Context window | 4K tokens | 200K tokens |
| Multi-tool rounds | Often confused | Precise tool_use_id tracking |

---

### Files Changed
- `scripts/promote-open-payments.js` (new)
- `server/routes/payments.js` (new)
- `server/routes/abby.js` (rewritten)
- `server/lib/abby-tools.js` (extended)
- `server/lib/abby-prompt.js` (updated)
- `server/index.js` (added payments router)
- `client/src/views/PaymentsExplorer.jsx` (new)
- `client/src/views/PaymentsExplorer.module.css` (new)
- `client/src/views/HospitalDetail.jsx` (added payments panel)
- `client/src/views/ClinicianProfile.jsx` (added payments section)
- `client/src/components/AppShell.jsx` (added nav item)
- `client/src/App.jsx` (added route)
- `.env` (ANTHROPIC_API_KEY placeholder)

---

## MediCosts 1.0 Sprint — Phase 1.2: HCRIS Hospital Cost Reports (2026-03-02)

### Overview
Promoted CMS Hospital Cost Report (HCRIS Form 2552-10) data for FY2023 and FY2024 into
`medicosts.hospital_financials`. Key challenge: HCRIS uses a sparse pivot format where each
value is stored as `(rpt_rec_num, wksht_cd, line_num, col_num) → value`, requiring pivoting
with `FILTER` aggregation. Column names differ per year because they're named after the first
data row's values in the source CSV.

### Promote Script: `scripts/promote-hcris.js`

**HCRIS column mapping discovery:**
| Stage column | Meaning |
|---|---|
| `_748262` / `_770748` | `rpt_rec_num` (join key) |
| `_144042` / `_170075` | Provider CCN (hospital identifier) |
| `_10_01_2022` / `_10_01_2023` | Fiscal year begin date |
| `_12_31_2022` / `_12_31_2023` | Fiscal year end date |
| `_150393` / `_96572` | Numeric value (in NMRC table) |

**Worksheet → metric mappings (confirmed via CMS HCRIS 2552-10 codebook):**
| Worksheet | Line | Col | Metric |
|---|---|---|---|
| G200000 | 01000 | 00100 | Total patient charges (gross) |
| G200000 | 00100 | 00100 | Inpatient charges |
| S300001 | 00100 | 00200 | Licensed beds |
| S300001 | 00100 | 00300 | Total inpatient days |
| S100001 | 00100 | 00100 | Has charity program (>0) |
| S100001 | 00200 | 00100 | Charity care charges |
| S100001 | 02900 | 00100 | Cost of charity care |
| S100001 | 00700 | 00100 | Uncompensated care charges |
| S100001 | 03100 | 00100 | Total uncompensated care cost |

**Approach:** `DISTINCT ON (ccn) ORDER BY fy_end DESC` to get latest report per hospital, then
single-pass `SUM ... FILTER(WHERE ...)` pivot on NMRC table filtered to 3 worksheet codes.

**Results:**
| Year | Hospitals | With Charges | With Beds | With Uncomp Care | Avg Gross Charges | Avg Beds |
|---|---|---|---|---|---|---|
| 2023 | 5,939 | 5,787 | 5,933 | 4,491 | $114M | 113 |
| 2024 | 5,645 | 5,509 | 5,634 | 4,380 | $124M | 113 |

### API Routes: `server/routes/financials.js`
4 endpoints mounted at `/api/financials`:
| Endpoint | Description |
|---|---|
| `GET /hospital/:ccn` | Cost report data for specific hospital + derived metrics (occupancy, uncomp %) |
| `GET /summary?year=` | National summary: totals, by bed size category, top uncomp care |
| `GET /top?year=&by=` | Leaderboard (charges/beds/uncompensated/occupancy) |
| `GET /uncompensated?year=&state=` | Top uncompensated care providers with hospital name join |

### Frontend
- **`client/src/views/FinancialsExplorer.jsx`** — new `/financials` page
  - 7 KPI cards (hospitals, avg charges, total charges, avg beds, occupancy, uncomp care, charity)
  - 2-column grid: by-bed-size breakdown + top 15 uncompensated care providers
  - Sortable leaderboard (4 modes) with click-through to `/hospitals/:ccn`
- **`client/src/views/FinancialsExplorer.module.css`** — full dark-mode styles
- **`client/src/views/HospitalDetail.jsx`** — added "Cost Report Financials" panel
  - Shows gross charges, beds, inpatient days, occupancy, uncompensated care cost
  - Charity care details if available (charges, cost, % of total)
- **`client/src/components/AppShell.jsx`** — added "Hospital Financials" nav item
- **`client/src/App.jsx`** — registered `/financials` route

### Files Changed
- `scripts/promote-hcris.js` (new)
- `server/routes/financials.js` (new)
- `server/index.js` (added financials router)
- `client/src/views/FinancialsExplorer.jsx` (new)
- `client/src/views/FinancialsExplorer.module.css` (new)
- `client/src/views/HospitalDetail.jsx` (added financials panel)
- `client/src/components/AppShell.jsx` (added nav item)
- `client/src/App.jsx` (added route)

---

## Phase 2.2 — Mobile Responsiveness (2026-03-02)

### AppShell Mobile Sidebar
- Added `mobileOpen` state (boolean) alongside existing `collapsed` state
- **Hamburger button**: SVG 3-bar icon in topbar breadcrumb, hidden on desktop (`display: none`), shown on `≤480px` via CSS
- **Overlay backdrop**: `div.mobileOverlay` fixed over content when sidebar open, tap to close
- **Auto-close**: `useEffect` on `location.pathname` sets `mobileOpen(false)` on every navigation
- Sidebar uses `transform: translateX(-100%)` → `translateX(0)` transition on mobile (no layout reflow)
- Sidebar class conditionally combines: `s.collapsed`, `s.mobileOpen` independently

### CSS Changes (`AppShell.module.css`)
- Added `.hamburger` default style (hidden `display: none`, flex when enabled at mobile breakpoint)
- `@media (max-width: 480px)`:
  - `--_sidebar-w: 0px` so main area takes full width
  - Sidebar slides off-screen by default, `.mobileOpen` slides in over content with `z-index: 200`
  - `.mobileOverlay`: full-screen fixed backdrop at `z-index: 190`
  - `.hamburger { display: flex }` to show hamburger

---

## Phase 2.3 — In-Memory Query Cache (2026-03-02)

### `server/lib/cache.js` (new)
Simple TTL-based in-memory cache using `Map`:
- `cache(key, ttlSec, fn)` — returns cached value or calls `fn()` to compute + store
- `invalidate(prefix)` — delete keys matching prefix
- `stats()` — live/expired counts for monitoring

### Cache Applied To
| Endpoint | TTL | Rationale |
|---|---|---|
| `GET /api/drgs/top50` | 1 hour | Static materialized view, rarely changes |
| `GET /api/quality/summary` | 1 hour | Aggregate over all hospitals, stable |
| `GET /api/payments/summary` | 30 min | 30M row aggregate |
| `GET /api/payments/top?by=&year=` | 10 min | Heavy GROUP BY with year filter |
| `GET /api/financials/summary?year=` | 30 min | National HCRIS aggregates |
| `GET /api/financials/top?year=&by=` | 10 min | Leaderboard queries |
| `GET /api/financials/uncompensated?year=&state=` | 10 min | Joined query with name lookup |

Cache keys include all query parameters, so different filter combinations cache independently.

---

## ClearNetwork: Fix 3 Failing Insurer Crawlers — UHC, Anthem, Aetna (2026-03-02)

### Overview

Addressed the three insurers that failed in the initial multi-insurer crawl:
- **UnitedHealthcare** — `uhc_blob_api` had no handler (completed with 0 files)
- **Anthem** — 10GB gzipped index caused OOM (buffered entire file in RAM)
- **Aetna** — `browser_required` type was skipped (needs headless browser)

### 1. UnitedHealthcare — Blob API Handler

**Problem:** UHC's MRF data is served via a REST API at `/api/v1/uhc/blobs/` that returns all 85,321 blobs in a single JSON response — not a standard CMS index format.

**Solution:** New `fetch_uhc_blob_index()` function in `mrf_index.py`:
- Single unauthenticated GET returns all blobs with Azure SAS download URLs (valid until 2030)
- Filters to `_index.json` files (66K of 85K blobs)
- Sorts by size descending, picks top N indexes (larger = more plans/providers)
- Parses each sub-index for in-network file URLs using existing `fetch_and_parse_index()`
- Deduplicates shared in-network URLs across employer indexes

**Test results:** Parsed 20 sub-indexes → 1,042 plans, 2,591 unique in-network URLs. Successfully downloaded 2 files, linked 42 providers.

### 2. Anthem — Streaming Gzip Decompression

**Problem:** Anthem's index is 10.36 GB gzipped. Previous code did `data = await resp.read()` (10GB into RAM) then `gzip.decompress(data)` (50GB+ into RAM).

**Solution:** Dual-path `fetch_and_parse_index()`:
- **Small indexes (< 100MB):** Existing in-memory path (fast, unchanged)
- **Large indexes (>= 100MB):** New streaming path:
  - Downloads to temp file in 1MB chunks via `resp.content.iter_chunked()`
  - Opens with `gzip.open()` for streaming decompression (near-zero memory)
  - Feeds directly to `ijson.parse()` for incremental processing
  - Cleans up temp file after parsing
  - 2-hour timeout (up from 5 minutes)

Also refactored the parsing logic into reusable helpers:
- `_parse_index_from_stream()` — single-pass ijson parsing (entity name, plans, in-network URLs)
- `_parse_index_from_bytes()` — json.loads fallback

**Verification:** Confirmed 10.36 GB file streams correctly, gzip magic bytes (`1f8b`) detected, 1MB chunks flowing at ~1 MB/s. Full crawl expected to take 2-3 hours via nightly cron.

### 3. Aetna — Playwright Browser Automation

**Problem:** Aetna's MRF portal (`mrf.aetna.com`) is a React SPA behind Azure AD B2C OAuth. Old HealthSparq direct URLs are dead (404). The guest token endpoint requires API keys + fingerprinting.

**Solution:** New `crawler/browser.py` module:
- Uses Playwright to navigate the SPA in headless Chromium
- Intercepts network responses matching `apix.cvshealth.com` and `transparency-proxy.aetna.com`
- Extracts MRF URLs from intercepted API responses using regex pattern matching
- Also scrapes direct links and page source for any `_index.json` or `in-network` URLs
- Discovered index files are then parsed through the standard `fetch_and_parse_index()` pipeline

**Orchestrator integration:**
- New `--include-browser` CLI flag (off by default, Playwright is heavy)
- Lazy import of `crawler.browser` — only loaded when browser mode is active
- Falls back to skip message if Playwright isn't installed

**Dependency:** `playwright>=1.45.0` added as optional `[browser]` extra in `pyproject.toml`

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `clearnetwork/crawler/mrf_index.py` | Modified | UHC blob handler, streaming gzip, refactored parse helpers |
| `clearnetwork/crawler/orchestrator.py` | Modified | UHC/browser dispatch, `--include-browser` flag |
| `clearnetwork/crawler/browser.py` | New | Playwright-based browser automation for Aetna |
| `clearnetwork/pyproject.toml` | Modified | Added `playwright` as `[browser]` optional dependency |
| `.gitignore` | Modified | Added `.claudeapikey` |

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| Working MRF endpoints | 4 | **5** (UHC now working) |
| Anthem support | OOM on 10GB index | **Streaming to disk, near-zero memory** |
| Aetna support | Skipped entirely | **Playwright automation available** |
| Orchestrator flags | `--automatable-only`, `--max-files` | + **`--include-browser`** |

---

## Phase 1.3 — HRSA Shortage Areas (2026-03-02)

### Data Promotion
- **`scripts/promote-hrsa.js`** — Unions 3 HPSA tables + MUA/MUP from stage → `medicosts.hrsa_shortage_areas`
  - Primary Care: 28,432 designated areas | avg score 14.8/25
  - Dental Health: 20,199 | avg score 16.6/25
  - Mental Health: 19,813 | avg score 16.0/25
  - Medically Underserved: 19,645 areas
  - Total: 88,089 records; filters out `Withdrawn` status, NULL scores
  - Note: population field uses NUMERIC cast first to handle "34526.0" decimal strings

### API
- **`server/routes/shortage.js`**: 3 endpoints mounted at `/api/shortage-areas`:
  - `GET /?zip=` — shortage designations for a ZIP (Designated only)
  - `GET /state/:state` — summary by shortage type for a state (cached 1h)
  - `GET /national` — national counts + worst states for primary care (cached 1h)

### Frontend
- **`HospitalDetail.jsx`**: shortage area chips with score/type/population (red accent)
- **`CostEstimator.jsx`**: amber warning banner when searched ZIP is in shortage area
  - Live fetches on ZIP change, suggests widening radius

---

## Phase 1.4 — CDC PLACES Community Health (2026-03-02)

### Data Promotion
- **`scripts/promote-cdc-places.js`** — Pivots 1.17M long-format rows to 32,520 wide rows
  - Single-pass FILTER aggregation across 26 measureIDs
  - `datavaluetypeid = 'CrdPrv'` (crude prevalence, age-adjusted also available)
  - Results: avg diabetes 13.0%, avg obesity 35.8%, avg uninsured 10.0%

### API
- **`server/routes/community-health.js`**: 2 endpoints at `/api/community-health`:
  - `GET /:zip` — full health profile (26 measures + total population)
  - `GET /compare?zips=` — up to 10 ZIPs side by side

### Frontend
- **`HospitalDetail.jsx`**: "Community Health Context" KPI row (diabetes, obesity, heart disease, uninsured, depression, smoking) with source citation

---

## Phase 4.2 — Abby Tools for New Datasets (2026-03-02)

New tools added to `server/lib/abby-tools.js`:
- `get_shortage_areas(zip)` → `/api/shortage-areas?zip=`
- `get_shortage_summary_by_state(state)` → `/api/shortage-areas/state/:state`
- `get_community_health(zip)` → `/api/community-health/:zip`
- `get_hospital_financials(ccn)` → `/api/financials/hospital/:ccn`

---

## Phase 6.3 + 6.4 — Security Hardening (2026-03-02)

### Rate Limiting (`express-rate-limit`)
- `/api/` — 300 req / 15 min (general)
- `/api/abby/` — 20 req / 1 min (LLM inference protection)
- `/api/auth` — 20 req / 15 min (brute-force login protection)

### Env Validation
- `server/index.js` now validates `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `JWT_SECRET` at startup
- Exits with `FATAL` message if any required variable is missing

---

## ClearNetwork: Generic Browser Scraping, ZIP Support & Multi-Insurer Crawl (2026-03-02)

### Overview

Extended the ClearNetwork crawler with generic Playwright-based browser scraping, ZIP archive support for in-network files, and SSL domain normalization. Probed all 16 browser-required insurers, successfully crawled Kaiser Permanente (305K providers) and Centene (35 in-network URLs discovered).

### Browser Scraper Rewrite — `crawler/browser.py`

Rewrote `browser.py` from an Aetna-specific handler to a **generic 4-strategy browser scraper** that works for any insurer:

1. **Strategy 1 — `<a href>` extraction**: Evaluates all links matching `index.json`
2. **Strategy 2 — Page source regex**: Scans full HTML for `INDEX_JSON_RE` pattern
3. **Strategy 3 — Network interception**: Captures JSON responses from XHR/fetch calls, including Aetna-style API responses from `apix.cvshealth.com`
4. **Strategy 4 — Expandable sections**: Clicks "Show More", accordion headers, tab elements, then re-scans

Two public functions:
- `_scrape_page_for_mrf_urls(url)` — generic scraper returning deduplicated list of index URLs
- `fetch_mrf_urls_with_browser(url, session, max_indexes)` — wraps scraper + parses each discovered index via `fetch_and_parse_index()`

### Browser-Required Insurer Probing Results

Tested all 16 `browser_required` insurers with Playwright:

| Status | Insurers |
|--------|----------|
| **Working (direct HTML links)** | Kaiser Permanente (16 index URLs), Centene (12 index URLs) |
| **JS SPA, no discoverable URLs** | Highmark, Molina, Aetna |
| **HTTP errors (404/502/530)** | BCBS MI, IBX, BCBS NC, CareFirst, Oscar, BCBS MA, FL Blue, Humana, Bright |
| **Timeout / no URLs** | Medica, Premera |

### Kaiser Permanente — Full Pipeline Success

- Browser found **16 unique index URLs** from page HTML
- Parsed all 16 indexes → **2,704 plans**, **21 unique in-network URLs**
- In-network files are **ZIP archives** (not `.json.gz`) — required new ZIP support
- Downloaded 3 ZIP files → extracted **305,362 providers linked** to network
- Total pipeline: 193 seconds, 0 errors

### ZIP Archive Support — `crawler/mrf_parser.py`

Kaiser ships in-network rate files as `.zip` archives containing JSON. Added support:
- Magic bytes detection: `PK\x03\x04` for ZIP vs `\x1f\x8b` for gzip
- `zipfile.ZipFile` handler iterates all `.json` members
- Extracted `_extract_npis_from_stream()` helper for reuse across formats
- Falls back to `json.load()` if ijson is unavailable

### Centene — SSL Domain Fix

Centene's index JSON files contain download URLs with bare `centene.com` domain, which triggers `TLSV1_UNRECOGNIZED_NAME` SSL errors. `www.centene.com` works fine.

**Fix:** Added `_normalize_url()` in `downloader.py` that rewrites `://centene.com/` → `://www.centene.com/`.

### Database Fix

`crawl_jobs.status` was `VARCHAR(20)`, too short for `"completed_with_errors"` (21 chars). Widened to `VARCHAR(30)` via migration `006_widen_crawl_status.py`.

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `clearnetwork/crawler/browser.py` | Rewritten | Generic 4-strategy browser scraper (was Aetna-specific) |
| `clearnetwork/crawler/mrf_parser.py` | Modified | ZIP archive support, `_extract_npis_from_stream()` helper |
| `clearnetwork/crawler/downloader.py` | Modified | `_normalize_url()` for Centene SSL fix |
| `clearnetwork/alembic/versions/006_widen_crawl_status.py` | New | Widen `crawl_jobs.status` to VARCHAR(30) |

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| Total network-provider links | 1,547,627 | **1,718,004** |
| Working browser-scraped insurers | 0 | **2** (Kaiser, Centene) |
| File formats supported | JSON, gzip | + **ZIP archives** |
| Kaiser providers linked | 0 | **305,362** |

---

## ClearNetwork: Pennsylvania Health Plan Focus — UPMC + MRF Accessibility Audit (2026-03-02)

### PA Health Plan MRF Accessibility Research

Conducted comprehensive accessibility audit of all major Pennsylvania health insurers' Machine-Readable Files:

| Rank | Insurer | Accessibility | MRF Format | Status |
|------|---------|--------------|-----------|--------|
| 1 | **UPMC Health Plan** | Easy | Direct dated JSON (CMS standard) | **Added + crawled** |
| 2 | **Independence Blue Cross** | Hard | EIN-search API (`/cmsticsvc/`) | In registry (browser_required) |
| 3 | **Highmark BCBS PA** | Moderate | SPA with CloudFront signed URLs | In registry (browser_required) |
| 4 | **Capital Blue Cross** | Hard | EIN/HIOS lookup required | Not yet added |
| 5 | **Geisinger** | Hard | Radware Bot Manager blocks automation | Not yet added |
| 6 | **AmeriHealth Caritas** | N/A for PA | Only FL/NC/LA commercial plans | Medicaid-only in PA |
| 7 | **Gateway Health** | N/A | Acquired by Highmark (2021) | Data under Highmark |

National insurers also covering PA: UHC (working), Cigna (working), Aetna (browser_required), Anthem (streaming), Centene (browser_required), Oscar (404).

### UPMC Health Plan — Successfully Crawled

**Added to `known_insurers.json`:**
- URL pattern: `https://content.upmchp.com/publicweb/table-of-contents/{date}_UPMC-Health-Plan_index.json`
- Date pattern: `YYYY-MM-01` (current and previous months both work)
- Index type: `dated_azure`
- Standard CMS format: 2,581 reporting structures, 3,005 plans, 8 unique in-network URLs

**Data quality issue discovered:** UPMC's in-network JSON files have a doubled double-quote encoding bug — `"value""` instead of `"value"` at field boundaries. This breaks ijson's parser.

**Fix:** Added malformed JSON detection and sanitization in `mrf_parser.py`:
- Detects doubled-quote pattern (`""` at field boundaries) in first 512 bytes
- Reads full file, applies `replace(b'""', b'"')` to collapse doubled quotes
- Parses sanitized content from in-memory `BytesIO` stream
- No temp files needed

**Crawl results:**
- 3,001 plans stored
- 68,786 unique NPIs extracted from first in-network file
- 68,306 providers linked to UPMC network
- 148 seconds, 0 errors

### IBX Investigation

IBX's `/transparency-in-coverage` redirects to `/cmsticsvc/` (returns 400 — requires EIN parameters). Their `/developer-resources` page has direct JSON files but those are ACA Marketplace format (provider/formulary URLs), not CMS Transparency-in-Coverage format. Correctly classified as `browser_required`.

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `clearnetwork/crawler/known_insurers.json` | Modified | Added UPMC Health Plan |
| `clearnetwork/crawler/mrf_parser.py` | Modified | Doubled-quote JSON sanitization for UPMC |

### Updated Metrics

| Metric | Before | After |
|--------|--------|-------|
| Total network-provider links | 1,718,004 | **1,786,310** |
| Registered PA insurers | 3 | **4** (+ UPMC) |
| UPMC providers linked | 0 | **68,306** |
| Total plans | 105,784 | **108,785** |

---

## Phase 6.5 — Structured Logging (2026-03-02)

- **`server/lib/logger.js`**: Pino logger — JSON in production (piped to journald), pino-pretty in dev
- **`server/index.js`**:
  - Startup messages use `logger.info()` / `logger.fatal()`
  - Global Express error handler: logs `method`, `url`, `query`, `error.message`, `error.stack`, `ms`
  - `req._startAt = Date.now()` middleware for response time tracking

---

## Phase 7.1 — Public Landing Page (2026-03-02)

### Architecture
- Unauthenticated users now see `/` → `LandingPage` (not login gate)
- `BrowserRouter` wraps entire app so the router is always active
- Login is triggered by "Explore the Data" CTA within the landing page (inline modal-style flow)
- Authenticated users redirected `/` → `/overview`
- `/login` route available as a direct URL

### LandingPage.jsx sections
1. **Sticky nav**: Logo, links (Data Sources, Features), Sign In button
2. **Hero**: Headline "Know what hospitals actually charge", mission paragraph, dual CTAs
3. **Stats strip**: 3.4× markup, $26B surprise billing, 9M+ records
4. **Feature grid** (2×3): Hospital Explorer, Industry Payments, Shortage Alerts, Cost Estimator, Clinician Directory, Abby AI
5. **Data sources grid**: 8 sources with colored indicator dots
6. **CTA banner**: "Healthcare transparency is a right"
7. **Footer**: Data attribution, legal disclaimer

---

## Phase 7.2 — About & Methodology Page (2026-03-02)

- Route: `/about` inside authenticated app shell + nav item
- **Mission section**: Plain-language explanation of why this exists
- **Legal section**: 4 cards — no PHI, mandated disclosures, no affiliation, data limitations
- **Data sources**: 8 entries with agency, year, row count, description, official URL
- **Methodology notes**: 6 entries covering composite score calculation, charge markup ratio,
  HPSA score interpretation, CDC PLACES crude prevalence, Open Payments aggregation, geographic distance

---

## Phase 3.1 — ClearNetwork Insurance Network MVP (2026-03-03)

### Backend: `server/routes/network.js`
New route file exposing ClearNetwork data to the frontend:

- **`GET /api/network/check?npi=`** — Returns all insurance networks a provider (individual or facility) participates in. Queries `clearnetwork.canonical_providers` by NPI → `canonical_id` → `network_providers` → `networks` → `insurers`. Deduplicates by network name. Returns `{ npi, provider, networks[] }`.
- **`GET /api/network/hospital/:ccn`** — Hospital network lookup by CCN. No NPI in `hospital_info`, so uses name+state fuzzy matching: tokenizes facility name (skipping stop words), builds `ILIKE` conditions against `name_canonical`, adds hospital-type filter for hospitals to exclude pharmacy/lab matches.
- **`GET /api/network/insurers`** — Lists all insurers with active loaded networks + provider counts. 1-day cache.

Wired into `server/index.js` as `app.use('/api/network', networkRouter)`.

### Bug Fix: `trust proxy`
Added `app.set('trust proxy', 1)` to enable `express-rate-limit` to work correctly behind the Apache reverse proxy. Without this, every request behind the proxy threw `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.

### Frontend: ClinicianProfile + HospitalDetail
Both pages now show an **Insurance Networks** panel:
- **Green chip** per network with insurer name and tier (if available)
- If provider is in 0 networks: informational empty state noting which 4 insurers are loaded
- Source note and caveat to verify with insurer before scheduling

### Data Status
Active networks loaded (as of 2026-03-03):
| Insurer | Network | Providers |
|---------|---------|-----------|
| BCBS MN | Blue Cross and Blue Shield of Minnesota Network | 1.1M+ |
| HCSC | Blue Cross and Blue Shield of Illinois Network | 748K |
| Kaiser Foundation | Kaiser Permanente Insurance Company Network | 170K |
| UPMC Health Plan | UPMC Health Plan Network | ~140K |

Total: ~2.1M deduplicated provider-network links


---

## Phase 4.3 — Abby Conversation Memory (2026-03-03)

### DB Schema (auto-migrated via db-migrate.js)
```sql
abby_sessions (session_id UUID PK, user_id FK → users, title, created_at, last_active, message_count)
abby_messages (id BIGSERIAL PK, session_id FK, role, content TEXT, tool_calls JSONB, created_at)
```
Both tables created at startup via `runMigrations()`. Sessions are scoped to the authenticated user.

### Backend endpoints (server/routes/abby.js)
- `POST /api/abby/sessions` — create session (auto-titles from first user message)
- `GET /api/abby/sessions` — list user's 20 most recent sessions
- `GET /api/abby/sessions/:id/messages` — load full message history
- `POST /api/abby/sessions/:id/messages` — save message pair after each exchange
- `DELETE /api/abby/sessions/:id` — delete session

### Frontend (AbbyAnalytics.jsx)
- On each completed exchange, saves {user, assistant} pair to DB via POST
- "History (N)" button shows dropdown panel with session titles, message counts, dates
- Clicking a session loads its messages from DB and sets as current context
- "New Conversation" creates a fresh DB session + clears localStorage
- Auto-title: first 60 chars of the first user message
- Session ID persisted in localStorage between page reloads


---

## Session Wrap-Up (2026-03-03)

### Completed this session
- **Phase 3.1** — ClearNetwork MVP: NPI + hospital network lookups, insurance badges on HospitalDetail/ClinicianProfile, fixed `trust proxy` rate-limiter bug
- **Phase 6.2** — SQL injection hardening: payments `/top` fully parameterized, post-acute `/landscape` fixed (removed missing `mv_post_acute_landscape` view)
- **Phase 1.5** — Part D drug spending: 14K drugs + 1.38M prescribers, `/drugs` explorer page, ClinicianProfile Part D panel
- **Phase 4.3** — Abby conversation memory: `abby_sessions` + `abby_messages` DB tables, 5 session endpoints, history dropdown in UI
- **Phase 7.4** — README v1.0: complete rewrite for production platform

### Production admin password
Reset to `Admin2024!` (bcrypt hash updated directly in DB, Mar 3 2026)

---

## ClearNetwork: State-Level MRF Expansion — Multi-State BCBS Discovery (2026-03-03)

### Summary

Systematically expanded MRF coverage from 1 state (PA) to 10+ states by researching and probing BCBS affiliate MRF hosting patterns across the US. Created a persistent PostgreSQL knowledge base (`clearnetwork.mrf_research`) to track all research findings. Discovered the Sapphire MRF Hub platform and unlocked 3 new BCBS plans, split HCSC into 5 independent state entries, and upgraded BCBS NC from browser-required to direct JSON.

### Key Discoveries

**Sapphire MRF Hub** (`*.sapphiremrfhub.com`)
- S3+CloudFront platform used by select BCBS affiliates for CMS-standard MRF hosting
- Root page is a Gatsby SPA containing direct links to dated JSON index files
- `/tocs/current/{slug}` redirects to latest dated index (evergreen URL)
- 3 live subdomains found: `bcbsm` (MI), `bcbsla` (LA), `premera` (WA/AK)
- 85 subdomains scanned — only these 3 resolve; others use EIN-search portals

**HCSC Multi-State Azure Blob**
- HCSC publishes separate index files per state at the same Azure blob endpoint
- Key finding: date is **not** the 1st of month — HCSC publishes around the 24th
- All 5 states confirmed: IL (29.6 MB), TX (25.1 MB), OK (6.2 MB), NM (3.0 MB), MT (1.6 MB)
- Plan names discovered by scraping each state's individual BCBS website

**BCBS NC Direct JSON**
- `mrfmftprod.bcbsnc.com` hosts direct JSON indexes (no browser needed)
- 2.4 GB index file — upgraded from `browser_required` to `dated_s3`

### New Automatable Insurers Added

| Insurer | State(s) | Index Type | Index Size | Test Crawl |
|---------|----------|------------|------------|------------|
| BCBS Michigan | MI | sapphire_hub | 264 KB | 77,162 providers |
| BCBS Louisiana (LAHSIC) | LA | sapphire_hub | 326 KB | 43,301 providers |
| HMO Louisiana | LA | sapphire_hub | 519 KB | — |
| Premera Blue Cross | WA, AK | sapphire_hub | 1.7 MB | — |
| BCBS Texas | TX | dated_azure | 25.1 MB | 97,005 providers |
| BCBS Montana | MT | dated_azure | 1.6 MB | — |
| BCBS Oklahoma | OK | dated_azure | 6.2 MB | — |
| BCBS New Mexico | NM | dated_azure | 3.0 MB | — |
| BCBS North Carolina | NC | dated_s3 | 2.4 GB | — |

### Registry Changes

- **Split HCSC** from 1 entry (IL-only) into 5 state-specific entries (IL, TX, MT, OK, NM)
- **Upgraded BCBS MI** from `browser_required` to `sapphire_hub`
- **Upgraded Premera** from `browser_required` to `sapphire_hub`
- **Upgraded BCBS NC** from `browser_required` to `dated_s3`
- **Added BCBS LA (LAHSIC)** and **HMO Louisiana** as new entries
- Total insurers in registry: 29 (was 22)

### Code Changes

- `orchestrator.py`: Expanded `try_dated_urls()` from 7-day to 14-day lookback for YYYY-MM-DD patterns (HCSC publishes around the 24th)
- `known_insurers.json`: 7 new entries, 3 type upgrades, 1 entry split into 5

### Knowledge Base

70 entries in `clearnetwork.mrf_research` covering research across all 50 states + DC:
- **10 easy** (automatable, verified URLs, added to registry)
- **17 browser_required** (EIN-search SPAs, no bulk access)
- **6 hard** (pages exist but no direct index URLs)
- **8 dead** (URLs return 404/connection errors)
- **29 unknown** (from initial probe, need deeper investigation)

### States Not Yet Accessible

Most remaining BCBS affiliates use EIN-search portals (HealthSparq, custom SPAs) that require employer identification numbers to look up MRF files. These cannot be bulk-crawled without knowing specific EINs:
- AR, KS, AL, SC, NJ, IA, NY (Excellus), TN, MA, and others

### Nightly Cron Impact

All new insurers are automatically picked up by the `--automatable-only` flag — no cron changes needed. The nightly crawl now covers:
- **National**: UHC, Anthem, Cigna (dated patterns + blob API)
- **Multi-state**: HCSC (IL, TX, MT, OK, NM)
- **State-specific**: BCBS MN, BCBS MI, BCBS NC, BCBS LA (x2), Premera (WA/AK), UPMC (PA/WV)

---

## Phase 7.5–7.8: Quality, Stats, Nav, and Excellence (2026-03-03)

### Phase 7.5 — Quality Command Center Improvements

Full rewrite of `QualityCommandCenter.jsx` and its CSS module:

- **Removed** `DomainTabs` accordion — all 6 domain sections now render simultaneously with `sectionLabel` dividers
- **Added** state filter to header row (propagates to all data calls via `qs` URL prefix)
- **Added** Phase 3 spotlight cards: worst PSI-90, worst HRRP readmission penalty, lowest patient star rating (red/amber/rose color coding, clickable → hospital detail)
- **Added** Phase 4 composite quality failure leaderboard: top 25 by PSI-90 with row heat map coloring proportional to value

### Phase 7.6 — Live Database Statistics

**Server:** `server/routes/stats.js` — public `/api/stats` endpoint with 24h in-memory cache, non-blocking startup computation via `setInterval`. Uses `pg_catalog.reltuples` for fast estimated table counts; exact `SUM` for dollar totals.

**Client:** `client/src/hooks/useStats.js` — hook with localStorage 24h TTL cache to avoid redundant fetches on each navigation.

**Removed all static labels** — replaced every hardcoded "9M+", "4,700+", "47M+" with live data:
- `AppShell.jsx` topbar — dynamic total_records badge
- `LoginPage.jsx` / `RegisterPage.jsx` — live hospitals + totalRecords (fallback to "47M+", "5,400+")
- `LandingPage.jsx` — fully dynamic stats, DATA_SOURCES expanded to 10 sources

**Live stats (at time of implementation):**
| Metric | Value |
|--------|-------|
| Total records | 47,720,044 |
| Open payments | 30,080,856 |
| Disclosed dollars | $6.6B |
| Clinicians | 2,686,173 |
| Hospitals | 5,426 |
| Physician services | 9,663,823 |

### Phase 7.7 — Accordion Nav + Admin Dropdown

**Problem:** Left sidebar was cluttered with all nav items flat-listed.

**Solution:**
- Grouped nav items into labeled accordion sections (Quality & Safety, Cost & Financials, Providers, Geography, Patient Tools, AI & Data)
- Each group has a chevron header — click to expand/collapse; active route's group auto-expands on navigation
- Open/closed state persisted in `localStorage` under `medicosts_nav_open_groups`
- In icon-only collapsed mode, accordion logic bypassed — all items render
- **Settings** and **Data Connectors** removed from sidebar entirely, moved to **Admin dropdown** in topbar
- Admin dropdown (gear icon + "Admin ▾") only renders when `user.role === 'admin'`; outside-click dismissal via `useRef + mousedown`

**New CSS classes:** `.navGroupHeader`, `.navGroupItems`, `.navGroupItemsHidden`, `.adminDropdown`, `.adminBtn`, `.adminMenu`, `.adminMenuItem`, `@keyframes menuFadeIn`

### Phase 7.8 — Best of the Best Excellence Page

New `/excellence` route — the counterpart to the Accountability Dashboard, celebrating providers that consistently deliver outstanding quality and safety.

**New files:**
- `client/src/views/ExcellenceView.jsx`
- `client/src/views/ExcellenceView.module.css`

**Added:**
- `AwardIcon` to `NavIcons.jsx`
- Lazy import + `/excellence` route in `App.jsx`
- Nav item "Best of the Best" under Quality & Safety in `AppShell.jsx`

**Page sections:**

| Section | Description |
|---------|-------------|
| 4 Hero KPIs | HAC-cleared count, avg national star rating, median PSI-90, % of 4★+ facilities |
| Spotlight — Gold | Best HCAHPS star-rated facility in selection |
| Spotlight — Emerald | Safest hospital by PSI-90 (lowest preventable complications) |
| Spotlight — Blue | Best readmission ratio (< 1.0 excess ratio) |
| Excellence Honor Roll | Top 25 composite score: 30% stars · 30% safety · 25% readmissions · 15% mortality |
| Safety Leaders | 15 hospitals with lowest PSI-90 scores |
| Readmission Champions | 15 hospitals with lowest excess readmission ratio |

Composite excellence score computed client-side via percentile ranking across all loaded facilities. Top 3 rows earn medal icons (🥇🥈🥉). Row heat map applies green tint proportional to score/maxScore for top performers. All rows clickable → hospital detail page.

---

## Overview Shock-Card Drill-Down (2026-03-03)

Made the 4 hero KPI cards on the Overview page clickable:

| Card | Destination |
|------|-------------|
| Average Hospital Markup | `/accountability` |
| Hospitals Penalized | `/accountability` |
| Safety Failures | `/accountability` |
| Avg Patient Rating | `/quality` |

**Changes:**
- `client/src/views/OverviewView.jsx` — converted `div.shockCard` to `button.shockCard.shockCardLink` with `onClick={() => navigate(...)}` for each card
- `client/src/views/OverviewView.module.css` — added `.shockCardLink` rule: `cursor: pointer`, hover border highlight + 2px translateY lift

**SOP established:** Deploy to production (`vite build && systemctl --user restart medicosts`) after every frontend change.


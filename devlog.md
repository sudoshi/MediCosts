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

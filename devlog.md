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

# MediCosts

A data visualization for cost/spend comparisons geographically across the United States based on Medicare inpatient hospital data. Explore the 50 most expensive Diagnosis Related Groups (DRGs) by ZIP code, state, and provider.

## Data Source

[CMS Medicare Inpatient Hospitals – by Provider and Service](https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/medicare-inpatient-hospitals-by-provider-and-service) — Data Year 2023, Release Year 2025

---

## Full Web App (Node + React)

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- The Medicare CSV file in `medicare-dashboard/MUP_INP_RY25_DY23_PrvSvc.csv` (or download from CMS)

### Setup

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env: set PGHOST, PGUSER, PGPASSWORD, PGDATABASE
   ```

3. **Create database and schema** (if needed)
   ```bash
   npm run create-db    # creates medicosts database
   npm run load-data    # creates medicosts schema, loads CSV, builds materialized views
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```
   - API: http://localhost:3090
   - Dashboard: http://localhost:5180 (proxies /api to the server)

Ports 3090 and 5180 are used to avoid conflicts with other deployed applications. Override in `.env` (`PORT`) or `client/vite.config.js` (`server.port`) if needed.

### Production

```bash
npm run build
NODE_ENV=production node server/index.js
```

Serves the built client and API from a single server on `PORT` (default 3090).

---

## Python Dash Dashboard (standalone)

Alternative dashboard using the same data, no database required.

```bash
cd medicare-dashboard
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open http://127.0.0.1:8051 (set `DASH_PORT` env var to override)

---

## Project Structure

```
├── client/          # React + Vite frontend
├── server/          # Express API
├── scripts/         # ETL (load-data.js)
├── medicare-dashboard/  # Python Dash prototype
└── .env.example     # Environment template
```

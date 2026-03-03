# MediCosts

**Healthcare transparency for everyone.** MediCosts surfaces what US hospitals charge, who gets paid by pharmaceutical companies, which communities lack enough doctors, and how Medicare prescription drug spending has grown — all from federally mandated public disclosures.

**Live:** [https://medicosts.acumenus.net](https://medicosts.acumenus.net)

---

## What It Does

| Feature | Data Source | Records |
|---------|-------------|---------|
| Hospital cost & quality explorer | CMS IPPS + Quality Initiative | 4,000+ hospitals |
| Industry payments to physicians | CMS Open Payments (Sunshine Act) | 30M+ payments |
| Part D drug spending trends | CMS Part D Dashboard 2019–2023 | 14K drugs, 1.38M prescribers |
| Hospital financials | HCRIS Cost Reports FY2023–2024 | 11,584 hospitals |
| Post-acute care directory | CMS Provider Compare | 60K+ facilities |
| Clinician directory | NPPES NPI Registry | 2.7M active providers |
| Insurance network lookup | ClearNetwork | 2.1M provider-network links |
| Healthcare shortage alerts | HRSA HPSA designations | 88K shortage areas |
| Community health profiles | CDC PLACES | 32,520 ZIP codes |
| Cost estimator | CMS DRG pricing + HRSA/CDC enrichment | 146K DRG records |
| Abby AI assistant | Anthropic Claude + all 12 datasets | Natural language queries |

---

## Stack

- **Frontend:** React 19 + Vite, React Router, Recharts, CSS Modules
- **Backend:** Node.js + Express, PostgreSQL (`pg`), SSE streaming
- **AI:** Anthropic Claude (claude-haiku-4-5 for tool orchestration, claude-sonnet-4-6 for synthesis)
- **Auth:** JWT (7-day expiry), bcrypt, per-route rate limiting
- **Deployment:** Apache reverse proxy + Let's Encrypt + systemd user service

---

## Data Sources

All data is from federally mandated public disclosures:

1. **CMS Medicare Inpatient Charges** — DRG-level hospital pricing (2023)
2. **CMS Hospital Quality Initiative** — HCAHPS, safety indicators, readmissions, mortality, 5-star ratings
3. **CMS Open Payments** — 30M+ pharma/device payments to physicians (PY2023–2024)
4. **HCRIS Hospital Cost Reports** — Annual financial statements, uncompensated care (FY2023–2024)
5. **NPPES NPI Registry** — All 2.7M active US healthcare providers
6. **CMS Part D Drug Spending** — 5-year Medicare drug cost trends with prescriber-level data
7. **CMS Post-Acute Care** — Nursing homes, dialysis, home health, hospice, IRF, LTCH quality ratings
8. **HRSA HPSA** — 88K health professional shortage area designations
9. **CDC PLACES** — ZIP-level prevalence for 26 chronic disease & health measures
10. **ClearNetwork** — Insurance network participation data (BCBS MN, BCBS IL, Kaiser, UPMC)

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
# 1. Clone and install
git clone https://github.com/sudoshi/MediCosts.git
cd MediCosts
npm run install:all

# 2. Configure environment
cp .env.example .env
# Edit .env: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, JWT_SECRET, ANTHROPIC_API_KEY

# 3. Create initial admin user
cd scripts && node seed-admin.js

# 4. Run development server
cd .. && npm run dev
# API: http://localhost:3090
# Frontend: http://localhost:5180
```

### Production Deploy

```bash
cd client && node ./node_modules/vite/bin/vite.js build
NODE_ENV=production node server/index.js
```

Single server on `PORT` (default 3090) — serves built client and API.

### Environment Variables

```env
PGHOST=localhost
PGDATABASE=medicosts
PGUSER=your_user
PGPASSWORD=your_password
PGPORT=5432
JWT_SECRET=your_64_char_secret
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
NODE_ENV=production
```

---

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── views/           # 26 page components
│   │   ├── components/      # Shared UI (Panel, Badge, Skeleton, AppShell)
│   │   ├── hooks/           # useApi (auth-injecting fetch)
│   │   └── utils/           # Format helpers, color scales
│   └── vite.config.js
├── server/
│   ├── index.js             # Express app + middleware + router wiring
│   ├── db.js                # pg Pool
│   ├── routes/              # 14 route files (api, quality, drugs, payments, ...)
│   ├── middleware/auth.js   # JWT requireAuth + requireAdmin
│   └── lib/
│       ├── abby-tools.js    # 20+ Anthropic tool definitions
│       ├── abby-prompt.js   # System prompt
│       ├── cache.js         # In-memory TTL cache
│       ├── db-migrate.js    # Auto-migration (users, abby_sessions, abby_messages)
│       └── logger.js        # Pino structured logging
├── scripts/
│   ├── promote-*.js         # ETL: stage → medicosts schema
│   └── seed-admin.js        # Create first admin user
└── docs/
    ├── plan.md              # v1.0 implementation plan
    └── devlog.md            # Chronological build log
```

---

## API Routes

All routes require `Authorization: Bearer <jwt>` except `/api/auth/*`.

| Route | Description |
|-------|-------------|
| `GET /api/drgs/top50` | Top 50 DRGs with national averages |
| `GET /api/quality/composite/:ccn` | Hospital quality composite score |
| `GET /api/hospitals/nearby` | Hospitals near ZIP code |
| `GET /api/drugs/top` | Top Part D drugs by spending |
| `GET /api/drugs/prescriber/:npi` | Prescribing data for a clinician |
| `GET /api/payments/physician/:npi` | Sunshine Act payments to a physician |
| `GET /api/network/check?npi=` | Insurance network status for a provider |
| `GET /api/shortage-areas?zip=` | HRSA shortage designations near a ZIP |
| `GET /api/community-health/:zip` | CDC PLACES health metrics for a ZIP |
| `GET /api/financials/hospital/:ccn` | HCRIS financial data for a hospital |
| `POST /api/abby/chat/stream` | SSE streaming chat with Abby AI |
| `GET /api/abby/sessions` | User's conversation history |

---

## Legal

All data is provider/facility-level. No individual patient records are stored or displayed. HIPAA does not apply.

Hospital charge data is disclosed under 45 CFR §180. Open Payments are mandated by 42 U.S.C. §1320a-7h. Hospital charges are not what patients actually pay — actual cost depends on insurance coverage and negotiated rates.

MediCosts is not affiliated with CMS, HRSA, CDC, HHS, or any insurance company.

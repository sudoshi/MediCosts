Here's a comprehensive prompt for Claude Code to build this ambitious healthcare network transparency system:

---

# Claude Code Prompt: Healthcare Insurance Network Intelligence Platform

## Project Overview

Build a comprehensive, automated data pipeline called **ClearNetwork** that aggregates, normalizes, and serves insurance plan network data across every major US health insurance plan — so consumers can verify in-network status for any provider, facility, lab, or pharmacy *before* making healthcare decisions.

---

## Mission & Scope

Healthcare consumers lose billions annually to surprise out-of-network bills. The ACA's Transparency in Coverage rule (effective 2022) **legally mandates** that all insurers publish machine-readable network files. This project harvests those legally-required public disclosures and makes them actually usable.

**Target data universe:**
- All commercial health plans (individual, employer-sponsored, marketplace)
- Medicare Advantage plans
- Medicaid managed care plans
- Short-term health plans
- Dental & vision networks
- Pharmacy benefit networks (PBM formularies)

---

## Phase 1: Discovery Engine — Finding Every Insurer's Data

### Task 1.1 — Build the Insurer Registry

```bash
# Start with known authoritative sources
```

Crawl and compile a master registry of every US health insurer from:

1. **CMS Transparency in Coverage index** — `https://www.cms.gov/healthplan-transparency-in-coverage` — this lists all required machine-readable file (MRF) submissions
2. **NAIC Company Search** — `https://content.naic.org/cis_consumer_information.htm` — all licensed insurance carriers by state
3. **HealthCare.gov plan finder API** — `https://www.healthcare.gov/find-coverage/` — marketplace plan metadata
4. **SAM.gov / DUNS registries** — for Medicare/Medicaid contractors
5. **State insurance department websites** — scrape all 50 state DOI carrier lists

For each insurer, extract:
```json
{
  "insurer_id": "uuid",
  "legal_name": "string",
  "trade_names": ["string"],
  "naic_code": "string",
  "states_licensed": ["string"],
  "plan_types": ["HMO", "PPO", "EPO", "POS", "HDHP"],
  "mrf_index_url": "string",
  "website": "string",
  "last_verified": "ISO8601"
}
```

### Task 1.2 — MRF (Machine-Readable File) Index Crawler

Per CMS mandate, every insurer must publish a `index.json` file linking to their network files. Build a crawler that:

1. Fetches each insurer's MRF index URL
2. Parses the `reporting_structure` array to identify all in-network files
3. Handles the common index formats:
   - Direct JSON index
   - Gzipped JSON (`content-encoding: gzip`)
   - Deflate-compressed files
   - Files split across multiple URLs (multi-part MRFs)
4. Resolves redirect chains (many insurers use CDN redirect hops)
5. Implements exponential backoff with jitter for rate limiting
6. Logs failures to a dead-letter queue for retry

```python
# Example MRF index structure to parse:
{
  "reporting_entity_name": "Aetna Life Insurance",
  "reporting_entity_type": "health insurance issuer",
  "reporting_structure": [
    {
      "reporting_plans": [...],
      "in_network_files": [
        {
          "description": "Commercial In-Network",
          "location": "https://..."
        }
      ]
    }
  ]
}
```

---

## Phase 2: Data Ingestion Pipeline

### Task 2.1 — Distributed Download Manager

MRF files are massive (some exceed 100GB uncompressed). Build a download manager that:

- Uses **async streaming** — never load full files into memory
- Implements **resumable downloads** with byte-range requests
- Processes files as **streaming JSON** using `ijson` (Python) or streaming parsers
- Runs on a **worker pool** — target 50 concurrent download workers
- Prioritizes smaller files first (quick wins) while large files process in background
- Tracks download progress, file sizes, and estimated completion times
- Deduplicates files by content hash — many plans share network files

```python
# Streaming parser pattern (do NOT load full JSON into RAM):
import ijson

async def stream_parse_network_file(url: str, plan_id: str):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            async for provider in ijson.items_async(
                response.content, 
                'in_network.item'
            ):
                yield normalize_provider(provider, plan_id)
```

### Task 2.2 — Provider Record Normalization

Raw MRF data is notoriously messy. Build a normalization layer:

**Input fields to extract per provider entry:**
- `npi` — National Provider Identifier (primary key, 10-digit)
- `name` — provider/org name
- `tin` — Tax ID number
- `provider_group_id`
- `negotiated_rates` array (rates vary by plan/billing code)
- `covered_services`

**Normalization rules:**
1. Validate NPI format — must be exactly 10 digits, pass Luhn check
2. Standardize names — uppercase, strip punctuation, normalize abbreviations (DR. → DR, LLC. → LLC)
3. Classify provider type using NPI taxonomy codes:
   - Individual providers (Type 1 NPI)
   - Organizations/facilities (Type 2 NPI)
4. Enrich with NPPES NPI Registry data — batch lookup `https://npiregistry.cms.hhs.gov/api/`
5. Geocode addresses using Census Geocoder API (free, no rate limit)
6. Flag `needs_verification` if address is missing, NPI is invalid, or name is blank

**Address standardization:**
- Use USPS CASS certification logic or `usaddress` library
- Normalize to: `{street, city, state_2letter, zip5, zip4, lat, lng}`

### Task 2.3 — Entity Resolution & Deduplication

The same hospital appears in 500 plan files under 200 different name variants. Build entity resolution:

1. **Exact match** on NPI — NPI is the gold standard, trust it
2. **Fuzzy match fallback** for records missing NPI:
   - Use `rapidfuzz` with token_sort_ratio ≥ 92 on name + address
   - Geospatial proximity check — same facility within 0.1 miles
3. Build a **canonical entity table**:
```sql
CREATE TABLE canonical_providers (
    canonical_id UUID PRIMARY KEY,
    npi VARCHAR(10) UNIQUE,
    name_canonical TEXT,
    entity_type VARCHAR(20), -- 'individual' | 'facility' | 'lab' | 'pharmacy'
    specialty_primary TEXT,
    specialty_codes TEXT[],
    address_street TEXT,
    address_city TEXT,
    address_state CHAR(2),
    address_zip CHAR(5),
    lat DECIMAL(9,6),
    lng DECIMAL(9,6),
    phone TEXT,
    accepting_new_patients BOOLEAN,
    last_updated TIMESTAMPTZ
);
```

---

## Phase 3: Database Architecture

### Task 3.1 — Schema Design

Use **PostgreSQL** with the following schema optimized for:
- Fast "is provider X in plan Y" lookups
- Geographic proximity queries
- Plan comparison queries

```sql
-- Core tables:

CREATE TABLE insurers (
    id UUID PRIMARY KEY,
    legal_name TEXT NOT NULL,
    naic_code VARCHAR(10),
    website TEXT,
    mrf_index_url TEXT,
    last_crawled TIMESTAMPTZ
);

CREATE TABLE plans (
    id UUID PRIMARY KEY,
    insurer_id UUID REFERENCES insurers(id),
    plan_id_cms TEXT, -- CMS plan ID for marketplace plans
    plan_name TEXT NOT NULL,
    plan_type VARCHAR(10), -- HMO, PPO, EPO, etc.
    metal_tier VARCHAR(10), -- Bronze, Silver, Gold, Platinum
    states TEXT[],
    year INTEGER,
    network_name TEXT, -- many plans share a network
    network_id UUID REFERENCES networks(id)
);

CREATE TABLE networks (
    id UUID PRIMARY KEY,
    network_name TEXT,
    insurer_id UUID REFERENCES insurers(id),
    last_updated TIMESTAMPTZ,
    provider_count INTEGER,
    mrf_source_url TEXT
);

CREATE TABLE network_providers (
    network_id UUID REFERENCES networks(id),
    canonical_provider_id UUID REFERENCES canonical_providers(id),
    in_network BOOLEAN DEFAULT TRUE,
    tier VARCHAR(20), -- 'preferred', 'standard', 'out-of-network'
    effective_date DATE,
    termination_date DATE,
    last_verified TIMESTAMPTZ,
    PRIMARY KEY (network_id, canonical_provider_id)
);

-- Indexes for performance:
CREATE INDEX idx_network_providers_network ON network_providers(network_id);
CREATE INDEX idx_canonical_providers_npi ON canonical_providers(npi);
CREATE INDEX idx_canonical_providers_geo ON canonical_providers 
    USING GIST (ST_Point(lng, lat)::geography);
CREATE INDEX idx_canonical_providers_name ON canonical_providers 
    USING GIN (to_tsvector('english', name_canonical));
CREATE INDEX idx_plans_state ON plans USING GIN(states);
```

### Task 3.2 — Pharmacy Network Extension

Pharmacy networks have unique attributes. Extend schema:

```sql
CREATE TABLE pharmacies (
    canonical_provider_id UUID REFERENCES canonical_providers(id),
    ncpdp_id VARCHAR(7), -- National Council for Prescription Drug Programs ID
    is_retail BOOLEAN,
    is_mail_order BOOLEAN,
    is_specialty BOOLEAN,
    is_24_hour BOOLEAN,
    chains TEXT[] -- ['CVS', 'Walgreens', etc.]
);

CREATE TABLE pharmacy_tiers (
    network_id UUID REFERENCES networks(id),
    pharmacy_id UUID REFERENCES canonical_providers(id),
    tier VARCHAR(20), -- 'preferred', 'standard', 'specialty', 'mail_order'
    copay_generic DECIMAL(8,2),
    copay_brand DECIMAL(8,2)
);
```

### Task 3.3 — Lab Network Extension

```sql
CREATE TABLE labs (
    canonical_provider_id UUID REFERENCES canonical_providers(id),
    clia_number VARCHAR(10), -- Clinical Laboratory Improvement Amendments ID
    lab_type VARCHAR(20), -- 'hospital', 'independent', 'physician_office'
    parent_company TEXT, -- Quest, LabCorp, etc.
    test_categories TEXT[]
);
```

---

## Phase 4: Supplementary Data Enrichment

### Task 4.1 — NPPES NPI Registry Enrichment

Batch enrich all providers against the official NPI registry:

```python
# Use the bulk NPPES download (monthly full replacement file)
# URL: https://download.cms.gov/nppes/NPI_Files.html
# File: NPPES_Data_Dissemination_[month]_[year].zip (~8GB)

# Fields to extract per NPI:
enrichment_fields = [
    'provider_first_name',
    'provider_last_name',
    'provider_organization_name',
    'provider_credential_text',  # MD, DO, NP, PA, etc.
    'provider_business_practice_location_address_*',
    'healthcare_provider_taxonomy_code_*',  # up to 15 specialties
    'is_sole_proprietor',
    'provider_enumeration_date',
    'last_update_date',
    'npi_deactivation_date',  # flag deactivated providers
]
```

### Task 4.2 — CMS Hospital Compare Integration

Enrich facility records with quality ratings:
- Hospital Compare: `https://data.cms.gov/provider-data/`
- Overall hospital rating (1-5 stars)
- Mortality rates, safety scores, patient experience
- Accreditation status (Joint Commission, DNV, etc.)

### Task 4.3 — DEA/State License Verification

For individual providers, cross-reference:
- DEA registration status (for controlled substance prescribers)
- State medical board license status (use each state's public API/lookup)
- Flag any providers with disciplinary actions or expired licenses

### Task 4.4 — Google Places / OpenStreetMap Enrichment

For consumer-facing data quality:
- Verify business hours
- Validate phone numbers
- Confirm address accuracy
- Patient ratings (informational, not primary)

---

## Phase 5: Change Detection & Freshness

### Task 5.1 — Incremental Update Pipeline

MRF files update monthly (sometimes weekly). Build change detection:

```python
class NetworkChangeDetector:
    def compare_network_snapshots(
        self, 
        network_id: UUID, 
        old_snapshot: date, 
        new_snapshot: date
    ) -> NetworkDiff:
        """
        Returns:
        - providers_added: List[CanonicalProvider]
        - providers_removed: List[CanonicalProvider]  
        - tier_changes: List[TierChange]
        - coverage_area_changes: dict
        """
```

Store diffs for consumer alerts:
```sql
CREATE TABLE network_changes (
    id UUID PRIMARY KEY,
    network_id UUID REFERENCES networks(id),
    change_type VARCHAR(20), -- 'provider_added', 'provider_removed', 'tier_change'
    canonical_provider_id UUID REFERENCES canonical_providers(id),
    old_value JSONB,
    new_value JSONB,
    effective_date DATE,
    detected_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Task 5.2 — Crawl Scheduler

Build an intelligent scheduler:
- Large insurers (Anthem, UHC, Aetna, BCBS): crawl weekly
- Mid-size insurers: crawl monthly
- Small/regional plans: crawl quarterly
- Detect `Last-Modified` and `ETag` headers to skip unchanged files
- Use robots.txt compliance — but note MRF files are specifically published for machine consumption per federal mandate

---

## Phase 6: API Layer

### Task 6.1 — REST API Endpoints

Build a FastAPI service exposing:

```
GET /v1/providers/search
  ?name=Mayo+Clinic
  &zip=55905
  &radius_miles=25
  &specialty=cardiology
  &plan_id=UUID
  → Returns: providers with in-network status for given plan

GET /v1/providers/{npi}
  → Full provider record + all plans they're in-network for

GET /v1/plans/search
  ?state=MN
  &zip=55901
  &plan_type=PPO
  → Returns: available plans with network metadata

GET /v1/plans/{plan_id}/network
  ?provider_npi=1234567890
  → Is this provider in-network? What tier?

GET /v1/plans/compare
  ?plan_ids=UUID1,UUID2,UUID3
  &provider_npis=NPI1,NPI2,NPI3
  → Side-by-side network overlap for given providers

GET /v1/networks/{network_id}/pharmacies
  ?zip=55901
  &radius_miles=5
  &tier=preferred
  → Preferred in-network pharmacies near location

GET /v1/networks/{network_id}/labs
  ?zip=55901
  &radius_miles=10
  → In-network labs near location

GET /v1/alerts/subscribe
  POST body: {plan_id, provider_npis[], email}
  → Subscribe to alerts when a provider leaves the network
```

### Task 6.2 — GraphQL API (Optional)

For more flexible consumer queries:

```graphql
query PlanNetworkCheck {
  plan(id: "uuid") {
    name
    type
    insurer { name }
    isInNetwork(npi: "1234567890") {
      status
      tier
      effectiveDate
      terminationDate
    }
  }
}

query NearbyInNetworkProviders {
  providers(
    planId: "uuid"
    specialty: "CARDIOLOGY"
    nearZip: "55901"
    radiusMiles: 20
    inNetworkOnly: true
  ) {
    npi
    name
    specialty
    address { street, city, state, zip }
    distanceMiles
    networkTier
    acceptingNewPatients
    hospitalAffiliations { name, inNetwork }
  }
}
```

---

## Phase 7: Infrastructure & Scale

### Task 7.1 — Infrastructure Requirements

```yaml
# Recommended stack for production scale:

crawler_workers:
  type: distributed_queue
  technology: Celery + Redis
  worker_count: 100
  memory_per_worker: 2GB
  
database:
  primary: PostgreSQL 15 with PostGIS
  read_replicas: 3
  storage: 10TB NVMe SSD
  connection_pooler: PgBouncer
  
object_storage:
  provider: S3-compatible
  purpose: raw MRF file cache, 90-day retention
  estimated_size: 50TB
  
search_layer:
  technology: Elasticsearch or pgvector
  purpose: full-text provider search, fuzzy matching
  
cache:
  technology: Redis
  ttl_api_responses: 3600s
  ttl_network_checks: 86400s

monitoring:
  metrics: Prometheus + Grafana
  logging: OpenTelemetry → Loki
  alerts: PagerDuty integration
```

### Task 7.2 — Estimated Data Volumes

```
~1,000 unique insurance carriers
~5,000 distinct plan networks  
~1.2M unique individual providers (NPIs)
~180,000 healthcare facilities
~70,000 pharmacies
~25,000 labs
~500M network_provider relationship records
~2TB normalized relational data
~50TB raw MRF files cached
```

---

## Phase 8: Compliance & Legal Considerations

### Task 8.1 — Legal Framework Notes

Include in code comments and README:

1. **CMS Transparency in Coverage Rule (45 CFR §147.211)** — mandates insurers publish these files publicly for machine consumption. Data collection is legally authorized and encouraged.
2. **No authentication scraping** — only access publicly published, unauthenticated MRF endpoints
3. **robots.txt compliance** — honor crawl delays; MRF index endpoints are typically whitelisted
4. **Rate limiting** — implement minimum 1-second delay between requests per domain, respect `Retry-After` headers
5. **Data attribution** — preserve `reporting_entity_name` for each data record's provenance
6. **PHI/PII** — MRF data contains NO patient data; all provider data is publicly listed business information
7. **HIPAA** — does NOT apply to this data (it's business/provider directory data, not patient health information)

### Task 8.2 — Data Quality Disclaimer System

Every API response must include:
```json
{
  "data": {...},
  "meta": {
    "data_source": "Insurer MRF published 2024-11-01",
    "last_verified": "2024-12-15",
    "freshness_warning": null,
    "disclaimer": "Network status changes frequently. Always verify with your insurer before receiving care. This data is sourced from publicly mandated insurer disclosures."
  }
}
```

---

### Phase 9 — Consumer-Facing Features

---

### 9.1 — "Will This Be Covered?" Embeddable Widget

**Goal:** A self-contained `<clear-network-check>` web component embeddable on any third-party healthcare website with a single `<script>` tag.

#### 9.1.A — Widget Architecture & Bundling

- [ ] Choose build target: **Vite lib mode** (single `widget.js` bundle, no framework deps)
- [ ] Implement as a **Custom Elements v1** (`class ClearNetworkCheck extends HTMLElement`)
- [ ] Use **Shadow DOM** for full CSS encapsulation — host page styles cannot bleed in
- [ ] Bundle to `dist/widget.js` with `iife` format; expose global `ClearNetwork` namespace
- [ ] Support attributes: `plan-id`, `provider-npi`, `show-alternatives`, `theme` (`light`/`dark`)
- [ ] Write `widget/vite.config.js` with `build.lib` config targeting `es` + `iife` formats

#### 9.1.B — Widget UI States

- [ ] **Loading state** — spinner with "Checking network status…" copy
- [ ] **In-network** — green badge, tier label (Preferred / Standard), effective date
- [ ] **Out-of-network** — red badge, termination date if known, disclaimer text
- [ ] **Unknown / data gap** — amber badge, "Verify directly with your insurer" CTA
- [ ] **Error state** — graceful degradation, insurer phone number fallback
- [ ] **Alternatives panel** (when `show-alternatives="true"`) — list of up to 5 nearby in-network providers of the same specialty, each with distance and tier

#### 9.1.C — Widget API Communication

- [ ] Widget fetches `GET /v1/plans/{plan-id}/network?provider_npi={npi}` on mount
- [ ] If `show-alternatives` enabled, also fetches `GET /v1/providers/search?specialty=&plan_id=&zip=&radius_miles=10`
- [ ] Cache responses in `sessionStorage` keyed by `plan-id:npi` — avoid redundant calls on same page
- [ ] Honor `meta.freshness_warning` from API response — surface amber banner if data > 45 days old
- [ ] Implement 3-second timeout with graceful degradation to "Verify with insurer"

#### 9.1.D — Widget Distribution

- [ ] Set up CDN distribution path (S3 + CloudFront or equivalent): `https://cdn.clearnetwork.io/widget.js`
- [ ] Versioned releases: `widget@1.0.0.js`, with `widget.js` pointing to latest stable
- [ ] Add `Access-Control-Allow-Origin: *` header on widget.js endpoint (required for cross-origin embed)
- [ ] Write `docs/widget-embed.md` — embed snippet, all attributes, theming guide, CSP requirements

#### 9.1.E — Widget Testing

- [ ] Jest unit tests for all UI state transitions
- [ ] Playwright E2E test: embed widget in a blank HTML page, assert correct state for mocked API
- [ ] Cross-browser test matrix: Chrome, Firefox, Safari, Edge (Custom Elements support check)

---

### 9.2 — Network Adequacy Scoring

**Goal:** Per-plan composite score quantifying whether the network actually serves its enrollee population. Computed as a batch job, stored, and exposed via API.

#### 9.2.A — Source Data Acquisition

- [ ] **HRSA HPSA data**: Download Health Professional Shortage Area designations from `https://data.hrsa.gov/data/download` (HPSA shapefile + CSV)
  - Import into PostGIS as `clearnetwork.hpsa_areas (id, shape GEOMETRY, population_underserved INT, shortage_type TEXT)`
- [ ] **ZIP code centroids**: Import ZCTA centroid table (from Census TIGER) — `clearnetwork.zip_centroids (zip5, lat, lng, population)`
- [ ] **Enrollee estimates**: Pull CMS Marketplace enrollment by ZIP/plan from `https://data.cms.gov/` — `clearnetwork.plan_enrollment (plan_id, zip5, enrollee_count)`
- [ ] **Drive-time matrix**: Set up local OSRM instance (or Valhalla) for isochrone queries, OR pre-compute 30-min drive radius polygons from each in-network hospital location and store as `clearnetwork.hospital_drive_polygons (canonical_provider_id, polygon GEOMETRY)`

#### 9.2.B — Database Schema for Adequacy Scores

```sql
-- New tables required:
CREATE TABLE clearnetwork.plan_adequacy_scores (
    plan_id UUID REFERENCES plans(id),
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    score_overall DECIMAL(5,2),         -- 0–100 composite
    score_pcp_access DECIMAL(5,2),      -- % HRSA shortage residents within 30mi of in-network PCP
    score_specialty_coverage DECIMAL(5,2), -- providers per 100k enrollees (avg across top 20 specialties)
    score_hospital_access DECIMAL(5,2), -- % enrollees within 30min drive of in-network hospital
    score_pharmacy_density DECIMAL(5,2),-- avg in-network pharmacies within 5mi per enrollee
    specialty_breakdown JSONB,          -- {cardiology: 3.2, oncology: 1.8, ...} per 100k
    shortfall_zips TEXT[],              -- ZIP codes with <1 in-network PCP within 30mi
    PRIMARY KEY (plan_id, computed_at)
);
```

- [ ] Add `CREATE INDEX` on `(plan_id, computed_at DESC)` for latest-score queries
- [ ] Create migration file `database/migrations/007_adequacy_scores.sql`

#### 9.2.C — Adequacy Score Computation Jobs (Python)

- [ ] `scorer/pcp_access.py` — For each plan:
  1. Get all HRSA HPSA ZIP codes that fall in plan's state(s)
  2. For each HPSA ZIP centroid, count in-network PCPs (taxonomy: Family Medicine, Internal Medicine, Pediatrics) within 30-mile radius using PostGIS `ST_DWithin`
  3. Compute: `(HPSA ZIP centroids with ≥1 PCP within 30mi) / (total HPSA ZIP centroids)` × 100
- [ ] `scorer/specialty_coverage.py` — For each plan and each of top 20 specialties:
  1. Count in-network providers of that specialty in plan's service area
  2. Divide by (plan enrollee count / 100,000)
  3. Store per-specialty breakdown in `specialty_breakdown` JSONB
- [ ] `scorer/hospital_access.py` — For each plan:
  1. Load all enrollee ZIP centroids weighted by `enrollee_count`
  2. For each ZIP centroid, check if any in-network hospital drive polygon covers it
  3. Compute weighted % of enrollees covered
- [ ] `scorer/pharmacy_density.py` — For each plan:
  1. For each enrollee ZIP centroid, count in-network pharmacies within 5 miles
  2. Average across all enrollee ZIP centroids (weighted by enrollee count)
- [ ] `scorer/composite.py` — Weighted average: PCP 40%, Hospital 30%, Specialty 20%, Pharmacy 10%
- [ ] `scorer/runner.py` — Celery task to run all four scorers per plan, write to `plan_adequacy_scores`
- [ ] Schedule via Celery beat: run after each successful network ingestion per plan

#### 9.2.D — Adequacy Score API

- [ ] `GET /v1/plans/{plan_id}/adequacy` — returns latest `plan_adequacy_scores` row + specialty breakdown
- [ ] `GET /v1/plans/{plan_id}/adequacy/history` — returns last 12 monthly scores for trend display
- [ ] `GET /v1/plans/adequacy/compare?plan_ids=UUID1,UUID2` — side-by-side adequacy for plan shopping
- [ ] `GET /v1/adequacy/rankings?state=MN&plan_type=PPO` — plans ranked by `score_overall` descending

#### 9.2.E — Adequacy Score Frontend Component

- [ ] `client/src/components/AdequacyScore.jsx` — Radial gauge (0–100) using Recharts `RadialBarChart`
- [ ] Color scale: < 50 red, 50–74 amber, 75–89 blue, 90+ green
- [ ] Expand panel: show sub-scores (PCP, Hospital, Specialty, Pharmacy) as horizontal bar chart
- [ ] "Shortfall ZIPs" map overlay — highlight ZIP codes with inadequate coverage
- [ ] Trend line: 12-month adequacy history using `LineChart`

---

### 9.3 — Plan Comparison for Specific Providers

**Goal:** Consumer enters their current providers (by name or NPI), picks a state, and sees which plans cover all/most of them — ranked by coverage score.

#### 9.3.A — Provider Search & Selection UI

- [ ] `client/src/pages/FindMyPlan.jsx` — dedicated page at `/find-my-plan`
- [ ] Provider search input: typeahead against `GET /v1/providers/search?name=&zip=&specialty=`
  - Debounced (300ms), min 3 chars
  - Result shows: name, specialty, address, NPI
- [ ] "My Providers" cart — add up to 10 providers; persist in `localStorage`
- [ ] State selector dropdown (required — narrows plan universe)
- [ ] Plan type multi-select filter: HMO / PPO / EPO / POS / HDHP
- [ ] Metal tier filter: Bronze / Silver / Gold / Platinum
- [ ] "Find Plans" submit button

#### 9.3.B — Backend Query Engine

- [ ] `api/routers/plan_finder.py` — endpoint `GET /v1/plans/for-providers`
  ```
  ?provider_npis=NPI1,NPI2,NPI3
  &state=MN
  &plan_types=PPO,EPO    (optional)
  &metal_tiers=Silver,Gold  (optional)
  ```
- [ ] Core SQL query strategy:
  ```sql
  -- For each plan, count how many of the requested NPIs are in-network
  SELECT
    p.id AS plan_id,
    p.plan_name,
    p.plan_type,
    p.metal_tier,
    i.legal_name AS insurer_name,
    COUNT(DISTINCT np.canonical_provider_id) AS providers_covered,
    array_agg(DISTINCT cp.npi) AS covered_npis,
    -- Tier weighting: preferred = 2pts, standard = 1pt
    SUM(CASE np.tier WHEN 'preferred' THEN 2 ELSE 1 END) AS tier_score
  FROM plans p
  JOIN networks n ON p.network_id = n.id
  JOIN network_providers np ON np.network_id = n.id
  JOIN canonical_providers cp ON cp.id = np.canonical_provider_id
  JOIN insurers i ON i.id = p.insurer_id
  WHERE cp.npi = ANY($1::text[])
    AND $2 = ANY(p.states)
    AND (p.plan_type = ANY($3) OR $3 IS NULL)
  GROUP BY p.id, p.plan_name, p.plan_type, p.metal_tier, i.legal_name
  ORDER BY providers_covered DESC, tier_score DESC;
  ```
- [ ] Add `coverage_pct` computed field: `(providers_covered / requested_count) * 100`
- [ ] For each plan result, include per-provider breakdown:
  ```json
  "provider_coverage": [
    {"npi": "1234567890", "name": "Dr. Smith", "in_network": true, "tier": "preferred"},
    {"npi": "9876543210", "name": "Mayo Clinic", "in_network": false, "tier": null}
  ]
  ```
- [ ] Integrate premium data if available (`plan_premiums` table, age-28 benchmark)
- [ ] Paginate: default 20 results, max 100

#### 9.3.C — Results Display

- [ ] `client/src/components/PlanResultCard.jsx`
  - Plan name + insurer logo/name
  - Coverage score: "Covers X of Y providers" with progress bar
  - Per-provider grid: each requested provider as a row — green checkmark / red X / tier badge
  - Plan type + metal tier badge
  - Monthly premium (if available)
  - "View full network" link to plan detail page
- [ ] Sort controls: by coverage %, by tier score, by premium (asc/desc)
- [ ] Filter rail: minimum coverage % slider, plan type checkboxes
- [ ] Empty state: if no plans cover all providers, show "Best partial matches" with gap analysis
- [ ] Export: "Download comparison as PDF" (use `react-pdf` or `window.print()`)

#### 9.3.D — Shareable Results

- [ ] Encode provider NPIs + filters into URL query params for shareable links
- [ ] `GET /v1/plans/for-providers/share` — store search params server-side, return short token
- [ ] Resolve: `GET /find-my-plan?token=abc123` — reconstruct search on load

#### 9.3.E — Alert Integration (hook into Phase 6 alerts)

- [ ] After finding plans, offer "Alert me if a plan drops a provider" opt-in
- [ ] Calls `POST /v1/alerts/subscribe` with plan_id + provider_npis[] + email
- [ ] Confirmation email sent via transactional email service (SendGrid / Postmark)

---

## Phase 10 — Monitoring & Data Quality

---

### 10.1 — Data Quality Dashboard

**Goal:** React admin dashboard giving operators full visibility into pipeline health, crawl status, and data quality metrics.

#### 10.1.A — Admin Authentication

- [ ] Admin dashboard served at `/admin` route — protected by session auth
- [ ] `server/middleware/adminAuth.js` — check `req.session.isAdmin` or `Authorization: Bearer <token>`
- [ ] Environment variable `ADMIN_TOKEN` for simple bearer token auth (MVP)
- [ ] Upgrade path: integrate with SSO/LDAP for team access

#### 10.1.B — Admin API Endpoints

All under `/admin/` prefix, require admin auth middleware:

- [ ] `GET /admin/quality/crawl-stats`
  ```json
  {
    "total_insurers": 1000,
    "crawled_last_7d": 823,
    "success_rate_pct": 94.2,
    "by_insurer": [
      {"insurer_id": "...", "name": "Aetna", "last_crawl": "2024-12-14", "status": "success", "file_count": 47}
    ]
  }
  ```
- [ ] `GET /admin/quality/npi-validity?insurer_id=`
  - Per-insurer NPI validation pass rates
  - Flag insurers below 90% threshold
- [ ] `GET /admin/quality/geocode-rates`
  - Overall geocode success %
  - % with lat/lng vs address-only vs no address
- [ ] `GET /admin/quality/staleness`
  - For each network: days since last successful crawl
  - Flag: > 30 days = stale, > 60 days = critical
- [ ] `GET /admin/quality/provider-deltas?days=30`
  - For each network: provider count (current vs 30 days ago)
  - Flag: drops > 20% as anomalies
- [ ] `GET /admin/quality/failing-insurers`
  - Top 25 insurers by consecutive crawl failures
  - Include last error message and HTTP status code
- [ ] `GET /admin/quality/checks/history?limit=50`
  - Last N automated quality check runs with pass/fail per check

#### 10.1.C — Database Tables for Quality Metrics

```sql
CREATE TABLE clearnetwork.crawl_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    insurer_id UUID REFERENCES insurers(id),
    network_id UUID REFERENCES networks(id),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,  -- 'running', 'success', 'failed', 'skipped'
    files_attempted INTEGER DEFAULT 0,
    files_succeeded INTEGER DEFAULT 0,
    providers_ingested INTEGER DEFAULT 0,
    error_message TEXT,
    http_status INTEGER
);

CREATE TABLE clearnetwork.quality_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at TIMESTAMPTZ DEFAULT NOW(),
    insurer_id UUID REFERENCES insurers(id),
    network_id UUID REFERENCES networks(id),
    metric_name VARCHAR(50) NOT NULL,  -- 'npi_validity_rate', 'geocode_rate', etc.
    metric_value DECIMAL(10,4),
    threshold DECIMAL(10,4),
    passed BOOLEAN GENERATED ALWAYS AS (metric_value >= threshold) STORED
);

CREATE TABLE clearnetwork.quality_check_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_at TIMESTAMPTZ DEFAULT NOW(),
    triggered_by VARCHAR(50),  -- 'ingestion_complete', 'scheduled', 'manual'
    checks_total INTEGER,
    checks_passed INTEGER,
    checks_failed INTEGER,
    results JSONB  -- array of {check_name, passed, value, threshold, message}
);

CREATE INDEX ON clearnetwork.crawl_runs (insurer_id, started_at DESC);
CREATE INDEX ON clearnetwork.quality_metrics (insurer_id, metric_name, measured_at DESC);
CREATE INDEX ON clearnetwork.quality_check_runs (run_at DESC);
```

- [ ] Migration file: `database/migrations/008_quality_tables.sql`

#### 10.1.D — Dashboard Frontend

- [ ] `client/src/pages/AdminDashboard.jsx` — route `/admin`
- [ ] **Header strip:** total insurers tracked / crawled last 7d / overall success rate (live refresh every 60s)
- [ ] **Crawl Status Table** (`components/admin/CrawlStatusTable.jsx`)
  - Columns: Insurer, Last Crawl, Status (badge), Files, Providers Ingested, Staleness (days)
  - Sortable by any column
  - Row color: green = success & fresh / amber = success & stale / red = failed
  - Search/filter by insurer name
  - Click row → insurer detail drawer with last 10 crawl run history
- [ ] **NPI Validity Bar Chart** (`components/admin/NpiValidityChart.jsx`)
  - Horizontal bar per insurer, sorted ascending by validity rate
  - Red dashed line at 90% threshold
  - Tooltip: exact count of invalid NPIs
- [ ] **Staleness Heatmap** (`components/admin/StalenessHeatmap.jsx`)
  - Grid: insurers (rows) × weeks (columns), last 12 weeks
  - Color: green < 7d, amber 7–30d, red > 30d, gray = never crawled
- [ ] **Provider Count Deltas** (`components/admin/ProviderDeltaChart.jsx`)
  - Recharts `ComposedChart` — bar = delta count, line = rolling average
  - Red bars for drops > 20%
  - Click bar → network detail with before/after provider lists
- [ ] **Top Failing Insurers** (`components/admin/FailingInsurersList.jsx`)
  - Table: Insurer, Consecutive Failures, Last Error, Last HTTP Status, Action buttons
  - "Retry Crawl" button → calls `POST /admin/crawl/retry` with insurer_id
  - "Mark Resolved" button → clears failure streak, adds note
- [ ] **Quality Checks Panel** (`components/admin/QualityChecksPanel.jsx`)
  - Last run timestamp + "Run Now" button
  - Pass/fail badge per check with current value vs threshold
  - Trend sparklines for each check (last 30 runs)

---

### 10.2 — Automated Quality Checks

**Goal:** Python quality check framework that runs after every ingestion batch, stores results, and fires alerts when thresholds are breached.

#### 10.2.A — Quality Check Framework

- [ ] `quality/base.py` — Abstract base class:
  ```python
  class QualityCheck(ABC):
      name: str
      threshold: float
      severity: Literal['warning', 'critical']

      @abstractmethod
      async def compute(self, db: AsyncConnection, scope: CheckScope) -> CheckResult:
          """Returns CheckResult(passed, value, message)"""
  ```
- [ ] `quality/runner.py` — Orchestrator:
  - Accepts list of `QualityCheck` instances + optional `scope` (all insurers, single insurer, single network)
  - Runs checks concurrently (asyncio.gather) with timeout per check (30s)
  - Writes `quality_check_runs` row to DB
  - Writes individual `quality_metrics` rows
  - Fires alerts for any failed checks (see 10.2.C)
  - Returns `QualityReport` dataclass with summary

#### 10.2.B — Individual Check Implementations

- [ ] `quality/checks/npi_validity.py` — `CheckNpiValidityRate`
  - SQL: `SELECT COUNT(*) FILTER (WHERE length(npi)=10 AND npi ~ '^\d{10}$') / COUNT(*)::float FROM canonical_providers WHERE insurer_scope`
  - Add Luhn algorithm check in Python for subset sample (full Luhn on all 1.2M NPIs in DB)
  - Threshold: 0.90 per insurer; scope: per-insurer

- [ ] `quality/checks/address_completeness.py` — `CheckAddressCompleteness`
  - SQL: `SELECT COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) / COUNT(*)::float`
  - Threshold: 0.85
  - Also check `address_street IS NOT NULL` separately at 0.90 threshold

- [ ] `quality/checks/duplicate_providers.py` — `CheckNoDuplicateCanonicalProviders`
  - SQL: `SELECT COUNT(*) FROM (SELECT npi, COUNT(*) FROM canonical_providers WHERE npi IS NOT NULL GROUP BY npi HAVING COUNT(*) > 1)`
  - Threshold: 0 duplicates (critical if any found)
  - Also check TIN + name collision for records without NPI

- [ ] `quality/checks/network_size_regression.py` — `CheckNetworkSizeRegression`
  - Compare `provider_count` in `networks` table vs count 30 days ago (from `quality_metrics` history)
  - Threshold: max 20% drop from previous snapshot
  - Scope: per-network, escalate to insurer level if multiple networks drop

- [ ] `quality/checks/geographic_distribution.py` — `CheckGeographicDistributionSanity`
  - For each network's declared states, verify ≥ 80% of providers have addresses in those states
  - Flag if > 5% of providers geocode to outside CONUS (Hawaii/Alaska/territories are valid exceptions)
  - Flag if any state has 0 providers for a plan that claims to serve that state

- [ ] `quality/checks/specialty_code_validity.py` — `CheckSpecialtyCodeValidity`
  - Download NUCC taxonomy code list (Health Care Provider Taxonomy): `http://nucc.org/`
  - SQL: validate all `specialty_codes` array values against NUCC reference table
  - Threshold: 0.95 validity rate
  - Cache NUCC reference in `clearnetwork.nucc_taxonomy` table (update quarterly)

- [ ] `quality/checks/freshness.py` — `CheckNetworkFreshness` (bonus, not in spec but critical)
  - For each network: days since last successful crawl
  - Warning at 30 days, critical at 60 days

#### 10.2.C — Alerting System

- [ ] `quality/alerting/channels.py` — Abstract `AlertChannel`:
  - `SlackWebhookChannel` — POST to Slack incoming webhook URL (env: `SLACK_WEBHOOK_URL`)
  - `EmailChannel` — send via SendGrid/SMTP (env: `ALERT_EMAIL_TO`, `SENDGRID_API_KEY`)
  - `PagerDutyChannel` — for `severity='critical'` only (env: `PAGERDUTY_ROUTING_KEY`)
  - `WebhookChannel` — generic POST to `ALERT_WEBHOOK_URL` with JSON payload

- [ ] `quality/alerting/dedup.py` — Alert deduplication:
  - Store hash of `(check_name, scope_id, severity)` in Redis with TTL
  - Warning TTL: 24 hours (don't re-alert same warning for 24h)
  - Critical TTL: 4 hours (re-alert every 4h if still failing)
  - `RESOLVED` notification when check transitions from fail → pass

- [ ] Alert message format:
  ```
  🔴 CRITICAL: NPI Validity Rate Below Threshold
  Insurer: Aetna Life Insurance (naic: 60054)
  Check: npi_validity_rate
  Value: 0.83 (threshold: 0.90)
  Scope: 47,234 invalid NPIs out of 279,102 total
  Time: 2024-12-15 14:32:00 UTC
  Action: Review https://admin.clearnetwork.io/insurers/aetna/npi-report
  ```

#### 10.2.D — Scheduler Integration

- [ ] `scheduler/tasks.py` — Add `run_quality_checks` Celery task
- [ ] Hook into ingestion pipeline: after `ingest_network_file` task completes, enqueue `run_quality_checks(scope={'network_id': ...})`
- [ ] Celery beat schedule: full global quality check run daily at 03:00 UTC regardless of ingestion activity
- [ ] `POST /admin/quality/checks/run` — manual trigger endpoint for dashboard "Run Now" button

#### 10.2.E — Quality Check Result Storage & History

- [ ] `quality/storage.py` — Writes `quality_check_runs` and `quality_metrics` rows after each run
- [ ] Retention policy: keep full `quality_check_runs` rows for 1 year; aggregate `quality_metrics` older than 90 days into monthly rollups
- [ ] `GET /admin/quality/checks/{check_name}/trend?days=90` — time series for dashboard sparklines
- [ ] Admin dashboard "Run Now" button shows live results via SSE (Server-Sent Events) or polling `GET /admin/quality/checks/status/{run_id}`

---

## Cross-Cutting Work Items

These items span both phases and must be completed to support either.

### Shared Infrastructure

- [ ] **PostGIS extension**: Verify `CREATE EXTENSION IF NOT EXISTS postgis` is in migrations — required for all geo queries in Phase 9 adequacy scoring
- [ ] **Redis**: Required for widget session cache, alert dedup, and Celery broker — document in `docker-compose.yml`
- [ ] **NUCC taxonomy reference table**: `clearnetwork.nucc_taxonomy (code, classification, specialization, effective_date)` — needed by 9.2 specialty scoring + 10.2 code validity check
- [ ] **HRSA reference tables**: HPSA shapefile → PostGIS table; ZIP centroid table — needed by 9.2 adequacy scoring
- [ ] **`meta` wrapper on all API responses**: All endpoints must return `{data: ..., meta: {data_source, last_verified, freshness_warning, disclaimer}}` per Phase 8 spec

### Testing

- [ ] Integration test suite for adequacy scorer: seed small test network, assert score computation is deterministic
- [ ] Quality check test harness: fixture DB with known bad data, assert each check correctly fails
- [ ] Widget: Playwright test embedding widget in headless Chromium with mocked API

### Documentation

- [ ] `docs/adequacy-methodology.md` — explain scoring formula, data sources, limitations
- [ ] `docs/quality-checks.md` — each check: what it measures, threshold rationale, how to remediate failures
- [ ] `docs/widget-embed.md` — embed snippet, CSP requirements, attribute reference, theming
- [ ] Update `docs/api-reference.md` with all new Phase 9/10 endpoints

---

## Prioritized Build Order

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | 10.2.A–B Quality check framework + checks | Foundation — must know data is trustworthy before building consumer features on top |
| 2 | 10.1.C Quality DB tables + migration | Required by both quality checks and dashboard |
| 3 | 10.1.B Admin API endpoints | Needed before dashboard can display anything |
| 4 | 10.2.C Alerting system | Ops safety net — critical before any production crawl at scale |
| 5 | 10.1.D Admin dashboard frontend | Operators can now see pipeline health |
| 6 | 9.2.A Reference data acquisition (HRSA, ZIPs, OSRM) | Long-running, start early — data downloads take time |
| 7 | 9.2.B–C Adequacy schema + computation jobs | Core scoring engine |
| 8 | 9.2.D Adequacy API endpoints | Expose scores to frontend + widget |
| 9 | 9.3.B Plan finder query engine | Most complex SQL, needs tuning |
| 10 | 9.3.A,C Find My Plan UI | Consumer-facing killer feature |
| 11 | 9.1.A–D Embeddable widget | Distribution/embed layer |
| 12 | 9.3.D Shareable results + alert integration | Polish + retention |
| 13 | All testing + documentation | Continuous, but formalize at end |

---

## Acceptance Criteria Summary

| Feature | Acceptance Criterion |
|---------|---------------------|
| Widget | Renders correct in-network status within 3 seconds; gracefully degrades on API timeout |
| Widget | Embeds on external page with zero CSS bleed-in/out |
| Adequacy Score | Scores computed for all plans within 24h of network ingestion |
| Adequacy Score | PCP access sub-score matches hand-computed reference for test plan |
| Plan Finder | Returns results for 3 NPIs + state in < 500ms p95 |
| Plan Finder | Per-provider coverage matrix is accurate (validated against raw network_providers table) |
| Quality Checks | All 6 checks run to completion in < 2 minutes for full dataset |
| Quality Checks | Slack/email alert fires within 5 minutes of threshold breach |
| Quality Checks | No duplicate alerts within dedup TTL window |
| Admin Dashboard | Crawl status table loads in < 2s with 1,000 insurers |
| Admin Dashboard | Staleness heatmap correctly colors networks by days-since-crawl |

---

*This system, if built and made publicly accessible, would represent one of the most impactful healthcare consumer transparency tools in the US — directly addressing the $26B annual surprise billing problem by giving consumers the information legally required to exist but practically impossible to access today.*

---

This prompt gives Claude Code everything it needs: legal grounding (the CMS mandate makes this explicitly authorized), architectural decisions already made, schema designs, streaming patterns to handle massive files, and a phased roadmap from discovery through consumer-facing features. The key insight embedded throughout is that this isn't "scraping the internet" in a gray-area sense — it's harvesting **federally mandated public disclosures** that insurers are legally required to publish in machine-readable format. The real engineering challenge is the scale and normalization problem, not access.
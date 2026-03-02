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

## Phase 9: Consumer-Facing Features

### Task 9.1 — "Will This Be Covered?" Widget

Build an embeddable JavaScript widget:
```javascript
// Embeddable on any healthcare website
<script src="https://clearnetwork.io/widget.js"></script>
<clear-network-check 
  plan-id="aetna-bronze-2024-mn"
  provider-npi="1234567890"
  show-alternatives="true"
/>
```

### Task 9.2 — Network Adequacy Scoring

Per plan, compute:
- **Adequacy score**: % of HRSA-defined shortage area residents within 30 miles of an in-network PCP
- **Specialty coverage**: For top 20 specialties, # of in-network providers per 100k enrollees
- **Hospital access**: % of enrollees within 30 min drive of in-network hospital
- **Pharmacy density**: Avg # of in-network pharmacies within 5 miles

### Task 9.3 — Plan Comparison for Specific Providers

Consumer use case: "I want to keep my current 5 doctors — which plans cover all of them?"
```python
def find_plans_covering_all_providers(
    provider_npis: List[str],
    state: str,
    plan_types: List[str] = None
) -> List[PlanWithCoverageScore]:
    """
    Returns plans ranked by:
    1. % of requested providers covered
    2. Tier quality (preferred > standard)
    3. Premium cost if available
    """
```

---

## Phase 10: Monitoring & Data Quality

### Task 10.1 — Data Quality Dashboard

Build admin dashboard tracking:
- MRF crawl success rate by insurer (target: >95%)
- NPI validation pass rate (flag insurers with >5% invalid NPIs)
- Address geocode success rate
- Network file staleness (age since last successful crawl)
- Top failing insurers (for manual outreach)
- Provider count deltas (sudden drops may indicate data issues)

### Task 10.2 — Automated Quality Checks

Run these checks after every ingestion batch:
```python
quality_checks = [
    check_npi_validity_rate(threshold=0.90),
    check_address_completeness(threshold=0.85),
    check_no_duplicate_canonical_providers(),
    check_network_size_regression(max_drop_pct=0.20),
    check_geographic_distribution_sanity(),
    check_specialty_code_validity(),
]
```

---

## Deliverables

1. **`crawler/`** — Async crawler with MRF discovery, download manager, streaming parser
2. **`normalizer/`** — Provider normalization, entity resolution, NPI enrichment
3. **`database/`** — PostgreSQL schema, migrations, indexes, materialized views
4. **`api/`** — FastAPI REST + optional GraphQL service
5. **`scheduler/`** — Celery-based crawl scheduler with change detection
6. **`widget/`** — Embeddable JS widget for external sites
7. **`dashboard/`** — React admin dashboard for monitoring
8. **`docs/`** — API documentation, data dictionary, legal framework README

---

## Success Criteria

- ✅ 95%+ of CMS-registered insurers successfully crawled
- ✅ 90%+ of provider records have valid NPI + geocoded address
- ✅ API p95 latency < 200ms for network check queries
- ✅ Data refreshed within 30 days of insurer MRF publication
- ✅ Zero PHI/patient data stored at any point in pipeline
- ✅ Consumer can check "is my doctor in-network" in under 3 seconds

---

*This system, if built and made publicly accessible, would represent one of the most impactful healthcare consumer transparency tools in the US — directly addressing the $26B annual surprise billing problem by giving consumers the information legally required to exist but practically impossible to access today.*

---

This prompt gives Claude Code everything it needs: legal grounding (the CMS mandate makes this explicitly authorized), architectural decisions already made, schema designs, streaming patterns to handle massive files, and a phased roadmap from discovery through consumer-facing features. The key insight embedded throughout is that this isn't "scraping the internet" in a gray-area sense — it's harvesting **federally mandated public disclosures** that insurers are legally required to publish in machine-readable format. The real engineering challenge is the scale and normalization problem, not access.
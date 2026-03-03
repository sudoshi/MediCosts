# MediCosts Data Enrichment Strategy

## Current State

MediCosts currently holds **236 CMS Provider Data CSV files** (24.6M rows in `stage`, ~5.8M rows promoted to `medicosts`) covering acute care hospitals, post-acute facilities (nursing homes, home health, hospice, dialysis), physicians/clinicians, and medical equipment suppliers. Geographic enrichment is limited to **Census ACS 5-Year ZCTA demographics** (median income, population by ZIP) and **RUCA codes** embedded in the inpatient data.

The platform has **44+ API endpoints**, **14 materialized views**, **11 years of historical inpatient cost data** (2013-2023), and an AI assistant (Abby) with 46 tools.

### What We Have

| Domain | Key Identifiers | Notes |
|--------|----------------|-------|
| Hospital quality & cost | CCN, DRG, ZIP, state | Inpatient, outpatient, physician services |
| Post-acute care | CCN, state | Nursing homes, home health, hospice, dialysis |
| Clinician directory | NPI, specialty, state | 2.7M NPIs with affiliations |
| Patient experience | CCN | HCAHPS, OAS-CAHPS, ICH-CAHPS surveys |
| Value-based programs | CCN | VBP, HAC, HRRP, MSPB |
| Demographics | ZCTA | Income + population only |

### What We're Missing

- **Social determinants of health** (poverty, education, food access, housing) at the ZIP or county level
- **Community health burden** (diabetes, obesity, smoking, chronic disease prevalence) to contextualize hospital utilization
- **Hospital financial health** (operating margins, cost-to-charge ratios, uncompensated care, bed counts, staffing)
- **Provider workforce supply** (shortage areas, physician density, specialty distribution)
- **Insurance landscape** (uninsured rates, Medicare Advantage penetration, Medicaid expansion effects)
- **Drug pricing** (Part D spending, acquisition costs, prescribing patterns)
- **Industry payments** (pharma/device manufacturer payments to physicians and hospitals)
- **Environmental/disaster risk** (natural hazard exposure, disaster history affecting hospital operations)
- **Rural/urban stratification** beyond the RUCA codes already in inpatient data

---

## Tier 1 — High Value, Easy Integration

These sources join directly on identifiers we already have (ZIP, CCN, NPI, state, county FIPS), require no API keys or special agreements, and are available as CSV downloads or open APIs.

---

### 1. CDC PLACES — Community Health Measures at ZIP Level

**What it is:** 36 model-based health estimates at the ZIP code (ZCTA) level, derived from the Behavioral Risk Factor Surveillance System (BRFSS). The single most impactful enrichment source for MediCosts because it answers the question: *what is the health burden of the community each hospital serves?*

**Agency:** CDC Division of Population Health

**Access:**
- **Download page:** https://www.cdc.gov/places/
- **Socrata API (ZCTA level):** `https://data.cdc.gov/resource/qnzd-25i4.json`
- **Socrata API (county level):** `https://data.cdc.gov/resource/swc5-untb.json`
- **Socrata API (census tract level):** `https://data.cdc.gov/resource/cwsq-ngmh.json`
- **Format:** JSON (Socrata Open Data API) or CSV bulk download
- **API key:** Free app token recommended (register at https://data.cdc.gov); works without one at lower rate limits
- **Size:** ~33,000 ZCTAs, ~3,200 counties, ~74,000 census tracts
- **Update frequency:** Annual (current release: 2024, based on 2022 BRFSS data)

**Key fields (36 measures):**

| Category | Measures |
|----------|----------|
| Chronic disease | Diabetes, COPD, coronary heart disease, stroke, cancer, asthma, kidney disease, arthritis |
| Risk behaviors | Smoking, obesity, binge drinking, physical inactivity, short sleep |
| Prevention | Health insurance, routine checkups, dental visits, mammography, cervical cancer screening, cholesterol screening, colorectal cancer screening |
| Mental health | Depression, frequent mental distress, frequent physical distress |
| Disability | Hearing, vision, cognitive, mobility, self-care, independent living |

**Join strategy:** Direct join on ZCTA (ZIP code) — matches our existing `zip5` and Census ZCTA data perfectly.

**Example API call:**
```
https://data.cdc.gov/resource/qnzd-25i4.json?$where=locationname='10001'&$limit=50
```

**Why it matters for MediCosts:** Enables analysis like "Do hospitals in communities with high diabetes prevalence have higher readmission rates?" or "Is there a correlation between community obesity rates and hospital cost per discharge?" This is the missing community-health context layer.

---

### 2. AHRQ Social Determinants of Health (SDOH) Database

**What it is:** A pre-compiled, multi-source SDOH dataset at the ZIP, county, and census tract level. AHRQ has already done the work of merging ACS, HRSA, USDA, CDC, and CMS sources into a single flat file. This is the broadest single-file enrichment source available.

**Agency:** Agency for Healthcare Research and Quality (HHS)

**Access:**
- **Download page:** https://www.ahrq.gov/sdoh/data-analytics/sdoh-data.html
- **Format:** CSV or SAS direct download (separate files by geography level and year)
- **API key:** None required
- **Size:** ~33,000 rows (ZIP-level file). Annual releases available from 2009-2022.

**Key fields (organized by SDOH domain):**

| Domain | Variables |
|--------|-----------|
| Social context | Poverty rate, % below 200% FPL, educational attainment, unemployment, single-parent households, English proficiency |
| Economic context | Median household income, Gini inequality index, % receiving SNAP, % receiving SSI, per capita income |
| Education | % no high school diploma, % bachelor's or higher, school enrollment |
| Physical infrastructure | Housing vacancy, % renter-occupied, median home value, broadband access, vehicle access, crowded housing |
| Healthcare context | Primary care provider rate, mental health provider rate, uninsured rate, preventable hospitalization rate |
| Food access | USDA food desert indicators, distance to supermarket |

**Join strategy:** Direct join on ZCTA (ZIP code) or county FIPS.

**Why it matters for MediCosts:** Answers "Why are costs higher here?" — e.g., hospitals serving areas with high poverty, low education, and food deserts may have fundamentally different cost structures and outcomes. Enables SDOH-adjusted quality comparisons.

---

### 3. CMS Hospital Cost Reports (HCRIS)

**What it is:** The financial statements that every Medicare-participating hospital files with CMS. Contains the actual operating costs, revenue, margins, staffing, and infrastructure data that the Provider Data quality files don't include. This is the deepest hospital-level financial enrichment available.

**Agency:** CMS

**Access:**
- **Download page:** https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports/hospital-2010-form
- **Format:** CSV direct download (three relational tables: RPT, ALPHA, NMRC)
- **API key:** None required
- **Size:** ~6,500 hospitals per year. NMRC table (numeric values) is ~3GB+ across all years.
- **Update frequency:** Annual (with current-year interim reports available)

**Key fields (extracted from worksheet/line/column references):**

| Category | Fields |
|----------|--------|
| Capacity | Total beds, ICU beds, NICU beds, operating rooms, average daily census, occupancy rate |
| Staffing | Total FTEs, RN FTEs, physician FTEs, residents/interns count |
| Financials | Total operating revenue, total operating costs, net patient revenue, operating margin, total margin |
| Cost structure | Cost-to-charge ratio, Medicare cost-to-charge ratio, case mix index |
| Uncompensated care | Charity care, bad debt, uncompensated care total, Medicaid shortfall |
| Teaching | Direct GME costs, IME adjustment, resident-to-bed ratio |
| Payer mix | Medicare days %, Medicaid days %, total patient days |

**Join strategy:** Provider CCN (6-digit CMS Certification Number) — same identifier used throughout MediCosts. Direct join.

**Why it matters for MediCosts:** Enables "Is this hospital expensive because it's inefficient, or because it's a high-acuity teaching hospital with large uncompensated care burdens?" Currently we have prices and quality scores but no view into the underlying cost structure.

**Implementation note:** The HCRIS data is stored in a relational format (report_id → worksheet → line → column → value). Loading requires a reference table that maps worksheet/line/column codes to human-readable field names. CMS publishes the form layout documentation. The practical approach: download the NMRC (numeric) and RPT (report) tables, join them, and extract the ~50 most useful fields using known worksheet references.

---

### 4. HRSA Health Professional Shortage Areas (HPSAs)

**What it is:** Federally designated areas with insufficient healthcare providers. Three types: primary care, dental health, and mental health. HPSA scores (1-25) indicate severity — higher means greater need.

**Agency:** Health Resources and Services Administration (HRSA)

**Access:**
- **Download page:** https://data.hrsa.gov/data/download (HPSA section)
- **API:** `https://data.hrsa.gov/api/shortage-areas`
- **Format:** CSV download or JSON API
- **API key:** None required
- **Size:** ~8,000+ designated HPSAs
- **Update frequency:** Continuously updated as designations change

**Key fields:**

| Field | Description |
|-------|-------------|
| HPSA ID | Unique designation identifier |
| Designation type | Geographic, population group, or facility-specific |
| Discipline | Primary care, dental, or mental health |
| HPSA score | 1-25 severity (higher = greater shortage) |
| County FIPS | Geographic location |
| State | State abbreviation |
| Provider-to-population ratio | Current ratio vs. target |
| Designation date | When the shortage was designated |
| Status | Designated, proposed withdrawal, etc. |

**Join strategy:** County FIPS code → ZIP-county crosswalk (HUD), or aggregate to state level. Some facility-specific HPSAs include ZIP codes.

**Why it matters for MediCosts:** "Is this hospital the only provider in a shortage area?" Workforce availability directly affects cost, quality, and access. A hospital with high readmission rates in a primary care HPSA tells a different story than one surrounded by abundant outpatient resources.

---

### 5. CMS Open Payments (Sunshine Act)

**What it is:** Every payment from pharmaceutical and medical device manufacturers to physicians and teaching hospitals, reported under the Physician Payments Sunshine Act. Covers consulting fees, speaking fees, meals, travel, research grants, royalties, and ownership interests.

**Agency:** CMS

**Access:**
- **Download page:** https://openpaymentsdata.cms.gov/
- **Socrata API (general payments):** `https://openpaymentsdata.cms.gov/resource/hbqb-ybb6.json`
- **Format:** JSON (Socrata) or CSV bulk download
- **API key:** None required (app token recommended for higher rate limits)
- **Size:** ~12 million payment records per year. Bulk files are multi-GB.
- **Update frequency:** Annual (with mid-year updates)

**Key fields:**

| Field | Description |
|-------|-------------|
| Physician NPI | Links to clinician directory |
| Physician name, specialty | Provider identification |
| Teaching hospital CCN | Links to hospital data |
| Manufacturer name | Paying company |
| Payment amount | Dollar value |
| Nature of payment | Consulting, food/beverage, travel, education, research, royalty, ownership |
| Drug/device name | Associated product (when applicable) |

**Join strategy:** Physician NPI (direct join to `clinician_directory`) and teaching hospital CCN (direct join to hospital tables).

**Why it matters for MediCosts:** Adds a transparency/conflict-of-interest dimension. "Do physicians who receive more industry payments have higher average charges?" or "Which hospitals receive the most manufacturer research funding?" Also useful for Abby to answer questions about physician-industry relationships.

---

### 6. CMS Provider of Services (POS) File

**What it is:** The master registry of all Medicare-participating providers with facility characteristics not available in the quality-focused Provider Data files. Critically includes **bed count, ownership type, and accreditation status** — key variables for hospital comparisons.

**Agency:** CMS

**Access:**
- **Download page:** https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/provider-of-services-file-hospital-non-hospital-type
- **Format:** CSV download (also available via data.cms.gov Socrata API)
- **API key:** None required
- **Size:** ~200,000+ providers (hospitals + all other types). Hospital subset ~6,500.
- **Update frequency:** Quarterly

**Key fields:**

| Field | Description |
|-------|-------------|
| CCN | CMS Certification Number |
| Provider name, address, ZIP | Location |
| County code | Geographic identifier |
| Bed count | Total certified beds |
| Ownership type | Nonprofit, for-profit, government (federal/state/local) |
| Teaching status | Teaching hospital indicator |
| Accreditation | Joint Commission, HFAP, DNV, or state-only |
| CMS region | Regional grouping |
| Participation date | When provider joined Medicare |
| Provider type | Short-term, long-term, psychiatric, rehabilitation, etc. |

**Join strategy:** CCN — direct join to all hospital-level MediCosts data.

**Why it matters for MediCosts:** Currently we have hospital names and addresses from `hospital_general_information` but not bed count, ownership type, or teaching status in a reliable structured form. These are essential segmentation variables — "How do for-profit hospitals compare to nonprofits on cost per discharge?" requires ownership type.

---

### 7. USDA Rural-Urban Commuting Area (RUCA) Codes — ZIP-Level Crosswalk

**What it is:** A 10-level rural-urban classification at the ZIP code level. The inpatient data already has RUCA codes per hospital, but this crosswalk provides RUCA codes for every ZIP in the country — enabling community-level rural/urban stratification beyond individual hospital locations.

**Agency:** USDA Economic Research Service

**Access:**
- **Download page:** https://www.ers.usda.gov/data-products/rural-urban-commuting-area-codes/
- **ZIP-RUCA crosswalk:** Available on the same page (separate Excel download)
- **Format:** Excel direct download
- **API key:** None required
- **Size:** ~40,000 ZIP codes
- **Update frequency:** Decennial (current: 2010-based, 2020 update pending)

**Key fields:**

| Field | Description |
|-------|-------------|
| ZIP code | 5-digit |
| Primary RUCA code | 1-10 (1=metropolitan core, 10=rural) |
| Secondary RUCA code | Subclassification |
| Tract population | Population of the associated census tract |

**Classification summary:**

| Code | Description |
|------|-------------|
| 1-3 | Metropolitan (urban core, high/low commuting) |
| 4-6 | Micropolitan (large town, commuting patterns) |
| 7-9 | Small town (small town core, commuting patterns) |
| 10 | Rural |

**Join strategy:** Direct ZIP code join to all MediCosts ZIP-level data.

**Why it matters for MediCosts:** Enables "rural vs. urban" analysis across all domains — not just inpatient but also physician costs, nursing homes, home health, etc. A single column addition with outsized analytical value.

---

### 8. FEMA Disaster Declarations

**What it is:** Every federal disaster declaration since 1953, including the specific counties affected. Covers hurricanes, floods, wildfires, tornadoes, pandemics, and other major events.

**Agency:** FEMA

**Access:**
- **API:** `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries`
- **Documentation:** https://www.fema.gov/about/openfema/api
- **Format:** JSON REST API (pagination supported), also CSV download
- **API key:** None required
- **Size:** ~65,000+ declarations (historical back to 1953)
- **Update frequency:** Within days of new declarations

**Key fields:**

| Field | Description |
|-------|-------------|
| Disaster number | Unique identifier |
| Declaration date | When disaster was declared |
| State | State abbreviation |
| County FIPS (fipsStateCode + fipsCountyCode) | Affected geography |
| Incident type | Hurricane, flood, fire, severe storm, pandemic, etc. |
| Incident begin/end dates | Duration |
| Declaration type | Major Disaster, Emergency, Fire Management |
| Title | Human-readable event name |

**Join strategy:** State + county FIPS → ZIP-county crosswalk → MediCosts ZIP data. Or aggregate to state level.

**Example API call:**
```
https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=state eq 'TX' and fyDeclared eq 2023&$orderby=declarationDate desc
```

**Why it matters for MediCosts:** Enables event-driven analysis — "Did hospital costs spike in counties affected by Hurricane Harvey?" or "How do disaster-prone areas compare in hospital infrastructure investment?" Also helps explain outlier cost patterns that might otherwise be puzzling.

---

## Tier 2 — High Value, Moderate Integration Effort

These sources require crosswalk files (ZIP-to-county), data format conversion (SAS/Excel), or have complex schemas, but provide significant analytical value.

---

### 9. County Health Rankings & Roadmaps

**What it is:** Annual county-level health rankings covering health outcomes (length and quality of life) and health factors (health behaviors, clinical care, social/economic, physical environment). Compiled from dozens of public sources into a single flat file.

**Agency:** University of Wisconsin Population Health Institute / Robert Wood Johnson Foundation

**Access:**
- **Download page:** https://www.countyhealthrankings.org/health-data/methodology-and-sources/data-documentation
- **Format:** Excel/CSV direct download (single national file with all counties)
- **API key:** None required
- **Size:** ~3,200 counties
- **Update frequency:** Annual (each March)

**Key fields (300+ variables, highlights below):**

| Category | Variables |
|----------|-----------|
| Mortality | Premature death (YPLL), child mortality, infant mortality, drug overdose mortality |
| Morbidity | Poor/fair health, poor physical health days, poor mental health days, low birthweight |
| Health behaviors | Adult smoking, adult obesity, physical inactivity, excessive drinking, teen births, food environment index |
| Clinical care | Uninsured rate, primary care physician ratio, dentist ratio, mental health provider ratio, preventable hospital stays, mammography screening, flu vaccination |
| Social/economic | High school completion, some college, unemployment, children in poverty, income inequality, social associations, violent crime, injury deaths |
| Physical environment | Air pollution (PM2.5), drinking water violations, severe housing problems, driving alone to work, long commute |

**Join strategy:** County FIPS code. Requires ZIP-to-county crosswalk (HUD — see Utility section below).

**Why it matters for MediCosts:** The most comprehensive county-level health profile available. Enables "Why are readmission rates high in this county?" — maybe it's high poverty, low physician density, and high smoking rates. One download covers what would otherwise require merging a dozen separate sources.

---

### 10. Census Small Area Health Insurance Estimates (SAHIE)

**What it is:** County-level estimates of health insurance coverage by age, sex, race/ethnicity, and income level. The most granular geographic insurance data from the Census Bureau.

**Agency:** U.S. Census Bureau

**Access:**
- **API:** `https://api.census.gov/data/timeseries/healthins/sahie`
- **Download page:** https://www.census.gov/data/datasets/time-series/demo/sahie/estimates-acs.html
- **Format:** JSON API or CSV download
- **API key:** Free Census API key (https://api.census.gov/data/key_signup.html)
- **Size:** ~3,200 counties
- **Update frequency:** Annual, 1-2 year lag

**Example API call:**
```
https://api.census.gov/data/timeseries/healthins/sahie?get=NIC_PT,NUI_PT,PCTUI_PT&for=county:*&in=state:*&time=2022&key=YOUR_KEY
```

**Key fields:**

| Field | Description |
|-------|-------------|
| NIC_PT | Number insured |
| NUI_PT | Number uninsured |
| PCTUI_PT | Percent uninsured |
| PCTIC_PT | Percent insured (by income bracket: <138% FPL, 138-200%, 200-400%, 400%+) |
| AGE_CAT | Age categories (0-18, 18-64, 40-64) |
| RACECAT | Race/ethnicity breakdowns |

**Join strategy:** County FIPS → ZIP-county crosswalk.

**Why it matters for MediCosts:** Uninsured rates affect hospital uncompensated care costs, emergency department utilization, and payer mix. "Hospitals in counties with >15% uninsured rate have X% higher charges" — this is a key cost driver we can't currently analyze.

---

### 11. CMS Medicare Advantage Penetration by County

**What it is:** Monthly enrollment counts showing how many Medicare beneficiaries in each county are in Original Medicare (fee-for-service) vs. Medicare Advantage (managed care). MA penetration rate directly affects hospital revenue models.

**Agency:** CMS

**Access:**
- **Download page:** https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/ma-state-county-penetration
- **Format:** CSV direct download
- **API key:** None required
- **Size:** ~3,200 counties. Monthly snapshots.
- **Update frequency:** Monthly

**Key fields:**

| Field | Description |
|-------|-------------|
| State | State abbreviation |
| County (SSA code) | Note: uses SSA county codes, not FIPS — crosswalk available on the CMS site |
| Total Medicare eligibles | Total beneficiaries |
| MA enrollment | Managed care enrollment count |
| MA penetration rate | % of Medicare beneficiaries in MA plans |
| FFS enrollment | Original Medicare count |

**Join strategy:** SSA county code → FIPS county code crosswalk (CMS publishes this) → ZIP-county crosswalk → MediCosts data. Or aggregate to state level for simpler joins.

**Why it matters for MediCosts:** Medicare Advantage plans negotiate different rates than Original Medicare. In counties with high MA penetration, hospital FFS volume is lower — affecting the CMS data we have (which only covers FFS). Understanding MA penetration helps explain why some counties show low discharge volumes despite large populations.

---

### 12. HRSA Area Health Resource File (AHRF)

**What it is:** A county-level compilation of over **6,000 variables** from 50+ data sources. HRSA has already done the massive aggregation work — this is the county-level equivalent of AHRQ SDOH but far more extensive.

**Agency:** HRSA

**Access:**
- **Download page:** https://data.hrsa.gov/topics/health-workforce/ahrf
- **Format:** SAS transport file or ASCII fixed-width with data dictionary
- **API key:** None required
- **Size:** ~3,200 counties
- **Update frequency:** Annual (typically February)

**Key variable categories (6,000+ total):**

| Category | Examples |
|----------|----------|
| Health professions | MDs per capita by specialty, DOs, dentists, RNs, PAs, pharmacists |
| Hospital infrastructure | Hospital count, beds, admissions, outpatient visits, ER visits |
| Health expenditures | Medicare reimbursement per enrollee, Medicaid payments |
| Demographics | Age distribution, race/ethnicity, birth/death rates, migration |
| Economics | Median income, poverty, unemployment, employer size |
| Environment | Air quality, water systems |
| Education | School enrollment, attainment levels |

**Join strategy:** County FIPS → ZIP-county crosswalk.

**Implementation note:** The SAS format requires conversion. Use a Python script with `pandas.read_sas()` or the R `haven` package to extract to CSV, then load to PostgreSQL. Select the ~100-200 most relevant variables rather than all 6,000.

**Why it matters for MediCosts:** If you could only add one county-level source, this would be it. The physician-per-capita ratios alone are invaluable for workforce analysis alongside HPSA designations.

---

### 13. NADAC (National Average Drug Acquisition Cost)

**What it is:** Weekly survey of retail pharmacy acquisition costs for drugs covered by Medicaid. Represents the actual cost pharmacies pay to acquire drugs — distinct from what they charge.

**Agency:** CMS / Medicaid

**Access:**
- **Socrata API:** `https://data.medicaid.gov/resource/a4y5-998d.json`
- **Download page:** https://data.medicaid.gov/dataset/dfa2ab14-06c2-457a-9e36-5cb6d80f8d93
- **Format:** JSON (Socrata) or CSV download
- **API key:** None required
- **Size:** ~30,000+ NDCs
- **Update frequency:** Weekly

**Key fields:**

| Field | Description |
|-------|-------------|
| NDC (National Drug Code) | Drug identifier |
| Drug name | Brand/generic name |
| NADAC per unit | Acquisition cost |
| Effective date | Pricing date |
| Pharmacy type | Retail, mail order |
| OTC flag | Over-the-counter indicator |
| Classification | Drug category |

**Join strategy:** NDC code for drug-specific analysis. Cross-reference with Part D data by drug name.

**Why it matters for MediCosts:** Drug costs are a major component of hospital and outpatient spending. NADAC provides the "true cost" baseline to compare against charges.

---

### 14. CMS Medicare Part D Prescribers by Provider

**What it is:** Prescribing patterns for every Medicare Part D prescriber — what drugs they prescribe, how much they cost, and prescribing behavior metrics (opioid rates, brand vs. generic).

**Agency:** CMS

**Access:**
- **Download page:** https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider
- **Format:** CSV download (large file, ~3GB)
- **API key:** None required
- **Size:** ~1.1 million prescribers per year
- **Update frequency:** Annual

**Key fields:**

| Field | Description |
|-------|-------------|
| NPI | National Provider Identifier |
| Provider name, specialty, state | Demographics |
| Total claims | Prescription count |
| Total drug cost | Total Part D spending |
| Total day supply | Volume metric |
| Beneficiary count | Unique patients |
| Opioid claims / opioid prescriber flag | Opioid prescribing behavior |
| Antibiotic claims | Antibiotic prescribing |
| Brand name drug cost / generic drug cost | Cost breakdown |
| Average beneficiary risk score | Patient complexity (HCC risk score) |

**Join strategy:** NPI — direct join to `clinician_directory` and physician utilization data.

**Why it matters for MediCosts:** Adds a prescribing dimension to clinician profiles. "Which cardiologists in Texas have the highest opioid prescribing rates?" or "How does brand vs. generic prescribing vary by state?" Currently Abby can answer cost and quality questions but not drug prescribing questions.

---

### 15. FEMA National Risk Index

**What it is:** A comprehensive natural hazard risk assessment at the county and census tract level. Combines expected annual loss from 18 hazard types with social vulnerability and community resilience scores.

**Agency:** FEMA

**Access:**
- **Download page:** https://hazards.fema.gov/nri/data-resources
- **Format:** CSV download or Shapefile
- **API key:** None required
- **Size:** ~3,200 counties, ~74,000 census tracts
- **Update frequency:** Annual updates

**Key fields:**

| Field | Description |
|-------|-------------|
| County/tract FIPS | Geographic identifier |
| Overall risk score | Composite risk index |
| Expected annual loss ($) | Dollar value of expected damage |
| Social vulnerability score | Community vulnerability to hazards |
| Community resilience score | Ability to recover from events |
| Hazard-specific ratings | Earthquake, flood, hurricane, tornado, wildfire, winter weather, heatwave, drought, landslide, volcanic, tsunami, coastal flooding, cold wave, ice storm, lightning, avalanche, strong wind, riverine flooding |

**Join strategy:** County FIPS → ZIP-county crosswalk.

**Why it matters for MediCosts:** Adds a risk/resilience layer — "Are hospitals in high-risk counties investing more in infrastructure?" or "How do natural disaster risk areas compare in healthcare access?" Useful context for Abby when analyzing regional cost differences.

---

## Tier 3 — Valuable, Requires More Effort

These sources have access barriers (account registration, complex APIs, large files requiring significant parsing) but provide unique data not available elsewhere.

---

### 16. IRS 990 Tax Filings (Nonprofit Hospital Financials)

**What it is:** Annual tax filings for nonprofit organizations, including hospitals. Schedule H specifically covers hospital community benefit, charity care, bad debt, and financial assistance policies. ProPublica provides a free API over the IRS data.

**Agency:** IRS (hosted by ProPublica)

**Access:**
- **ProPublica API:** `https://projects.propublica.org/nonprofits/api/v2/organizations/{EIN}.json`
- **IRS bulk data:** `s3://irs-form-990/` (public S3 bucket with XML filings)
- **IRS annual extracts:** https://www.irs.gov/statistics/soi-tax-stats-annual-extract-of-tax-exempt-organization-financial-data
- **Format:** JSON API (ProPublica), XML bulk (IRS S3), CSV (IRS extracts)
- **API key:** None required for ProPublica

**Key fields:**

| Field | Description |
|-------|-------------|
| EIN | Employer Identification Number |
| Total revenue | Annual revenue |
| Total expenses | Annual expenses |
| Net assets | Balance sheet |
| Executive compensation | CEO/officer pay |
| Program service revenue | Healthcare revenue |
| Schedule H: Charity care | Free/discounted care provided |
| Schedule H: Community benefit | Total community benefit spending |
| Schedule H: Bad debt | Uncollected patient debts |

**Join strategy:** EIN → hospital CCN crosswalk. No direct crosswalk exists in public data. Options: (a) fuzzy match on hospital name + address, (b) use the CMS Provider of Services file for name/address alignment, (c) manually build the crosswalk for the ~2,500 nonprofit hospitals.

**Why it matters:** Nonprofit hospitals receive tax exemptions in exchange for community benefit. "Is this hospital's charity care proportional to its tax benefit?" is a powerful accountability question. But the EIN-CCN crosswalk challenge makes this a Tier 3 source.

---

### 17. Area Deprivation Index (ADI)

**What it is:** A composite index ranking neighborhoods (census block groups) by socioeconomic deprivation. The national ADI percentile (1-100) provides a single-number summary of how deprived an area is.

**Agency:** University of Wisconsin / HRSA (Neighborhood Atlas)

**Access:**
- **Download page:** https://www.neighborhoodatlas.medicine.wisc.edu/
- **Format:** CSV download
- **Requires:** Free account registration (not a traditional API key)
- **Size:** ~220,000 census block groups
- **Update frequency:** Updated with ACS releases (current: 2021 ACS data)

**Key fields:**

| Field | Description |
|-------|-------------|
| Block group FIPS | 12-digit geographic identifier |
| State ADI rank | Decile ranking within state (1-10, 10 = most deprived) |
| National ADI percentile | Percentile ranking nationally (1-100, 100 = most deprived) |

**Join strategy:** Block group FIPS → aggregate to ZIP via HUD crosswalk. The ADI team also provides a 9-digit ZIP version.

**Why it matters:** ADI is increasingly used in healthcare research as a standard deprivation measure. CMS itself uses ADI in some payment models. Having it in MediCosts would align with industry practice. But the account registration and block-group-to-ZIP aggregation add friction.

---

### 18. Leapfrog Hospital Safety Grades

**What it is:** Semi-annual letter grades (A through F) for hospital patient safety, published by The Leapfrog Group. Widely recognized by consumers and media.

**Agency:** The Leapfrog Group (nonprofit)

**Access:**
- **Website:** https://www.hospitalsafetygrade.org/
- **Bulk data:** Requires data request form (free for research use)
- **Individual lookups:** Publicly available on website
- **Format:** CSV (via data request) or individual hospital pages
- **Size:** ~2,700 hospitals
- **Update frequency:** Semi-annual (spring and fall)

**Key fields:**

| Field | Description |
|-------|-------------|
| Hospital name | Facility name |
| CMS ID (CCN) | Join identifier |
| Safety grade | A, B, C, D, or F |
| State, city | Location |

**Join strategy:** CCN — direct join.

**Why it matters:** Leapfrog grades are the most consumer-friendly hospital safety metric. "This hospital has a grade of D" is far more impactful than "PSI-90 composite is 1.23." But limited programmatic access makes it Tier 3.

---

### 19. Medicaid Expansion Status (Static Reference)

**What it is:** A simple lookup table — which states have expanded Medicaid under the ACA, and when. Despite being small, this is a critical analytical variable for understanding hospital cost and coverage patterns.

**Agency:** CMS / KFF

**Access:**
- **KFF reference:** https://www.kff.org/affordable-care-act/issue-brief/status-of-state-medicaid-expansion-decisions-interactive-map/
- **Medicaid.gov:** https://www.medicaid.gov/medicaid/national-medicaid-chip-program-information/medicaid-chip-enrollment-data/index.html
- **Format:** Web page (manually compile into SQL)
- **Size:** 51 rows (50 states + DC)

**Implementation:** Create a static reference table:

```sql
CREATE TABLE medicosts.medicaid_expansion (
  state_abbr VARCHAR(2) PRIMARY KEY,
  expanded BOOLEAN NOT NULL,
  expansion_date DATE,  -- NULL if not expanded
  notes TEXT
);
```

**Why it matters:** Medicaid expansion status is one of the strongest predictors of hospital financial health, uncompensated care burden, and insurance coverage rates. A simple boolean flag enables powerful segmentation across all analyses.

---

## Utility: Essential Crosswalk Files

Several Tier 2 sources join on county FIPS rather than ZIP. These crosswalk files bridge the gap.

### HUD USPS ZIP-to-County Crosswalk

- **URL:** https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- **API:** `https://www.huduser.gov/hudapi/public/usps?type=1&query={ZIP}`
- **Format:** Excel download or JSON API
- **API key:** Free HUD user token (register at https://www.huduser.gov/hudapi/public/register)
- **Key fields:** ZIP, county FIPS, residential ratio, business ratio, total ratio
- **Update frequency:** Quarterly
- **Note:** Many ZIPs span multiple counties. The `residential ratio` field indicates what fraction of a ZIP's addresses are in each county. For most analyses, use the county with the highest residential ratio as the primary county.

### SSA-to-FIPS County Code Crosswalk

- **URL:** Available on CMS.gov alongside the MA penetration data
- **Purpose:** CMS Medicare enrollment files use SSA county codes (not FIPS). This crosswalk maps between them.

---

## Implementation Roadmap

### Phase 1 — Community Health Context (weeks 1-2)

| Step | Source | Effort | Impact |
|------|--------|--------|--------|
| 1 | HUD ZIP-County crosswalk | Load as reference table | Unlocks all county-based sources |
| 2 | CDC PLACES (ZIP-level) | Socrata API → stage → promote | 36 health measures at ZIP level |
| 3 | AHRQ SDOH (ZIP-level) | CSV download → stage → promote | Broad SDOH enrichment in one file |
| 4 | RUCA ZIP crosswalk | Excel → reference table | Rural/urban for all ZIPs |
| 5 | Medicaid expansion | Static SQL insert | 51 rows, high analytical value |

**New materialized views:**
- `mv_zip_health_profile` — merge Census demographics + PLACES health + SDOH + RUCA
- `mv_hospital_community_context` — hospital + surrounding ZIP community health burden

### Phase 2 — Hospital Deep Dive (weeks 3-4)

| Step | Source | Effort | Impact |
|------|--------|--------|--------|
| 6 | CMS Provider of Services | CSV → stage → promote | Bed count, ownership, teaching status |
| 7 | CMS Cost Reports (HCRIS) | CSV → parse worksheet references → promote | Operating margins, cost structure, FTEs |
| 8 | HRSA HPSAs | CSV/API → stage → promote | Shortage area designations |
| 9 | CMS Star Ratings (if not already fully loaded) | CSV → promote | Overall quality stars |

**New materialized views:**
- `mv_hospital_full_profile` — cost + quality + financial health + community + workforce

### Phase 3 — Insurance & Workforce (weeks 5-6)

| Step | Source | Effort | Impact |
|------|--------|--------|--------|
| 10 | Census SAHIE | API → stage → promote | County uninsured rates |
| 11 | CMS MA Penetration | CSV → crosswalk → promote | Medicare Advantage vs. FFS enrollment |
| 12 | County Health Rankings | Excel → stage → promote | Comprehensive county health factors |

### Phase 4 — Extended Analytics (weeks 7-8)

| Step | Source | Effort | Impact |
|------|--------|--------|--------|
| 13 | Open Payments | Socrata API → stage → promote | Industry payments to physicians/hospitals |
| 14 | Part D Prescribers | CSV → stage → promote | Prescribing patterns by NPI |
| 15 | NADAC drug pricing | Socrata API → reference table | Drug acquisition cost baseline |
| 16 | FEMA Disaster Declarations | JSON API → stage → promote | Disaster history overlay |
| 17 | FEMA National Risk Index | CSV → stage → promote | Natural hazard risk scores |

### Phase 5 — Deep Enrichment (weeks 9+)

| Step | Source | Effort | Impact |
|------|--------|--------|--------|
| 18 | HRSA AHRF | SAS → CSV → promote (selected variables) | 6,000+ county variables |
| 19 | ADI (Neighborhood Atlas) | Register → download → aggregate to ZIP | Block-group deprivation scores |
| 20 | IRS 990 (via ProPublica) | API → fuzzy match EIN-CCN → promote | Nonprofit hospital financials |
| 21 | Leapfrog Safety Grades | Data request → promote | Consumer-facing safety grades |

---

## Estimated Impact

| Metric | Current | After Full Enrichment |
|--------|---------|----------------------|
| Data sources | 2 (CMS Provider Data + Census) | 20+ |
| Geographic context per ZIP | Income, population | + 36 health measures, SDOH index, RUCA, food access, ADI |
| Hospital profile depth | Quality + cost | + financials, bed count, ownership, teaching, safety grade, workforce, industry payments |
| County-level context | None | Health rankings, insurance, workforce shortage, disaster risk |
| Drug/prescribing data | None | NADAC costs, Part D prescribing patterns |
| Abby analytical capability | "What are the most expensive DRGs?" | "Why are costs higher in rural shortage areas with high diabetes prevalence and low insurance coverage?" |

The key shift is from **descriptive** ("what does this hospital charge?") to **explanatory** ("why does this hospital charge what it does, given its community, workforce, financial position, and risk environment?").

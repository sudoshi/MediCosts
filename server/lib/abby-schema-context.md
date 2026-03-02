## Database Schema & Data Reference

You have access to a PostgreSQL database (`medicosts` schema) containing CMS Medicare datasets spanning 2013-2023 across acute care, post-acute care, and clinician domains. Use this reference to understand what data is available and how it's organized — this will help you choose the right tools without guessing.

### Data Domains

| Domain | Key Table/View | Records | What It Contains |
|--------|---------------|---------|-----------------|
| **Inpatient Costs** | `medicare_inpatient` | ~13K | Hospital × DRG cost data (charges, payments, discharges) — 2023 only |
| **Historical Inpatient** | `medicare_inpatient_historical` | ~1.98M | 11 years (2013-2023) of hospital × DRG cost data |
| **Hospital Info** | `hospital_info` | ~7K | Facility details, star ratings (1-5), type, ownership |
| **Infections (HAI)** | `nhsn_hai` | ~30K | SIR scores for CLABSI, CAUTI, SSI, MRSA, CDI per hospital |
| **Readmissions** | `hospital_readmissions` | ~10K | Excess readmission ratios (ERR) per condition |
| **Mortality** | `complications_deaths` | ~100K | 30-day mortality rates by condition + complications |
| **Patient Safety** | `patient_safety_indicators` | ~7K | PSI-90 composite, HAC scores, payment reductions |
| **Timely Care** | `timely_effective_care` | ~100K | ED wait times, imaging rates, immunization measures |
| **Patient Experience** | `hcahps_survey` | ~175K | Patient satisfaction star ratings by domain |
| **Outpatient** | `medicare_outpatient` | ~700K | Hospital APC-level outpatient costs |
| **Physician** | `medicare_physician` | ~9M | NPI-level HCPCS service costs and volumes |
| **Demographics** | `census_zcta` | ~33K | ZIP-level population, income, poverty rates |
| **Episode Spending** | `hospital_spending_by_claim` | ~64K | Spending per episode by claim type and time period |
| **Unplanned Visits** | `unplanned_hospital_visits` | ~67K | Readmission & ED return measures with confidence intervals |
| **Value-Based Purchasing** | `hospital_vbp` | ~2.5K | VBP domain scores and total performance score |
| **Spending/Beneficiary** | `spending_per_beneficiary` | ~4.6K | MSPB-1 ratio per hospital (1.0 = national avg) |
| **Nursing Homes** | `nursing_home_info` + `nursing_home_quality` | ~15K + ~250K | 5-star ratings, staffing, fines + MDS quality measures |
| **Home Health** | `home_health_agencies` | ~12K | Quality stars, discharge/readmission rates, Medicare spend/episode |
| **Hospice** | `hospice_providers` | ~465K | Per-measure quality scores (emotional support, symptoms, etc.) |
| **Dialysis** | `dialysis_facilities` | ~7.6K | 5-star rating, mortality/hospitalization/readmission/transfusion rates |
| **Clinician Directory** | `clinician_directory` | ~2.7M | NPI, name, specialty, medical school, telehealth, facility |
| **IRF Facilities** | `irf_info` + `irf_measures` | ~1.2K + ~79K | Inpatient rehab facility info + quality measures |
| **LTCH Facilities** | `ltch_info` + `ltch_measures` | ~319 + ~25K | Long-term care hospital info + quality measures |
| **Equipment Suppliers** | `medical_equipment_suppliers` | ~58K | DMEPOS suppliers: name, address, supplies, specialties |
| **ZIP Centroids** | `zip_centroids` | ~33K | ZIP code lat/lon centroids for distance calculations |

### Key Identifiers

- **`facility_id` / `provider_ccn`**: 6-digit CMS Certification Number (CCN) — the universal hospital identifier linking all tables
- **`drg_cd`**: Diagnosis-Related Group code (e.g., "470" = Major Joint Replacement)
- **`hcpcs_cd` / `hcpcs_code`**: Healthcare Common Procedure Coding System (physician/outpatient services)
- **`npi`**: National Provider Identifier (individual physicians/clinicians)
- **`zip5` / `zip_code` / `zcta`**: 5-digit ZIP code (used for geographic queries)
- **`state` / `state_abbr`**: 2-letter state abbreviation
- **`data_year`**: Year of historical data (2013-2023, in `medicare_inpatient_historical`)

### Materialized Views (Pre-Computed Aggregates)

These views are the primary query targets — prefer them over base tables:

| View | Purpose | Key Columns |
|------|---------|-------------|
| **`mv_top50_drg`** | 50 most expensive DRGs nationally | drg_cd, weighted_avg_payment, weighted_avg_charges, total_discharges, num_providers |
| **`mv_zip_summary`** | ZIP-level cost averages (top 50 DRGs only) | zip5, state_abbr, drg_cd, avg_total_payment, avg_covered_charge, num_providers |
| **`mv_zip_enriched`** | ZIP costs + Census demographics | All of mv_zip_summary + median_household_income, total_population |
| **`mv_hospital_cost_quality`** | Hospital cost + star rating join | provider_ccn, star_rating, weighted_avg_payment, total_discharges, num_drgs |
| **`mv_hospital_quality_composite`** | Master hospital scorecard (all quality metrics) | facility_id, star_rating, clabsi_sir, cauti_sir, psi_90_score, total_hac_score, avg_excess_readm_ratio, avg_mortality_rate, ed_time_admit, weighted_avg_payment |
| **`mv_state_quality_summary`** | State-level quality aggregates | state, num_hospitals, avg_star_rating, avg_clabsi_sir, avg_psi_90, avg_payment |
| **`mv_hcahps_summary`** | Pivoted patient experience (1 row/hospital) | facility_id, overall_star, nurse_comm_star, cleanliness_star, recommend_star, num_surveys |
| **`mv_physician_zip_summary`** | ZIP-level physician HCPCS aggregates | zip5, hcpcs_cd, hcpcs_desc, num_physicians, total_services, weighted_avg_charge |
| **`mv_drg_yearly_trend`** | National DRG cost trends (2013-2023) | data_year, drg_cd, weighted_avg_payment, total_discharges, num_providers |
| **`mv_state_yearly_trend`** | State-level DRG cost trends (2013-2023) | data_year, state_abbr, drg_cd, weighted_avg_payment, total_discharges |
| **`mv_provider_yearly_trend`** | Hospital-level yearly cost trends | data_year, provider_ccn, weighted_avg_payment, total_discharges, num_drgs |
| **`mv_hospital_episode_cost`** | Per-hospital episode cost profile | facility_id, pre_admission_spend, during_admission_spend, post_discharge_spend, complete_episode_spend |
| **`mv_hospital_value_composite`** | Quality + cost + VBP + MSPB + unplanned visits | facility_id, star_rating, vbp_total_score, mspb_score, readm_30_all_cause, complete_episode_spend |
| **`mv_post_acute_landscape`** | State-level post-acute care overview | state, num_nursing_homes, avg_nh_overall_rating, num_hh_agencies, avg_hh_quality_star, num_dialysis_facilities, num_irf_facilities, num_ltch_facilities |

### Metric Interpretation Guide

Understanding these metrics helps you explain results accurately:

| Metric | Scale | Better Direction | Context |
|--------|-------|-----------------|---------|
| **Star Rating** | 1-5 | Higher is better | CMS Overall Hospital Quality Rating |
| **SIR** (Standardized Infection Ratio) | 0-∞ | < 1.0 is better | 1.0 = national average; 0.5 = half the expected infections |
| **Excess Readmission Ratio** | 0-∞ | < 1.0 is better | > 1.0 = more readmissions than expected (penalized under HRRP) |
| **PSI-90** | 0-∞ | Lower is better | Composite patient safety indicator |
| **Total HAC Score** | 1-10 | Lower is better | Hospital-Acquired Condition score; > ~6.75 triggers payment reduction |
| **Mortality Rate** | % | Lower is better | 30-day death rate for specific conditions |
| **ED Wait Times** | Minutes | Lower is better | ED_1b = time to admission; ED_2b = time to decision; OP_18b = outpatient ED time |
| **VBP Total Performance Score** | 0-100 | Higher is better | Composite of clinical, safety, efficiency, and patient engagement domains |
| **MSPB-1** | 0-∞ | < 1.0 is better | Medicare Spending Per Beneficiary; 1.0 = national average episode cost |
| **EDAC (Excess Days in Acute Care)** | Days | Negative is better | Negative = fewer return days than average per 100 discharges |
| **Nursing Home Star Rating** | 1-5 | Higher is better | Overall, health inspection, quality measures, and staffing sub-ratings |
| **DTC Rate** (Discharge to Community) | % | Higher is better | Home health: % of patients discharged to community vs facility |
| **PPR Rate** (Potentially Preventable Readmission) | % | Lower is better | Home health: unplanned readmissions within 30 days |
| **compared_to_national** | Text | "Better than" | Values: "Better than the National Benchmark", "No Different than the National Benchmark", "Worse than the National Benchmark" |

### HAI Measure IDs

| Measure ID | Infection Type |
|-----------|---------------|
| HAI_1_SIR | CLABSI (Central Line-Associated Bloodstream Infection) |
| HAI_2_SIR | CAUTI (Catheter-Associated Urinary Tract Infection) |
| HAI_3_SIR | SSI — Colon Surgery |
| HAI_4_SIR | SSI — Abdominal Hysterectomy |
| HAI_5_SIR | MRSA Bacteremia |
| HAI_6_SIR | C. difficile (CDI) |

### Mortality Measure IDs (30-Day Death Rates)

| Measure ID | Condition |
|-----------|-----------|
| MORT_30_AMI | Acute Myocardial Infarction (Heart Attack) |
| MORT_30_HF | Heart Failure |
| MORT_30_PN | Pneumonia |
| MORT_30_COPD | Chronic Obstructive Pulmonary Disease |
| MORT_30_STK | Stroke |
| MORT_30_CABG | Coronary Artery Bypass Graft Surgery |

### Common Query Patterns (How Your Tools Map to Data)

**"Compare two hospitals"**
1. Use `search_hospitals` to find facility IDs for both
2. Use `get_hospital_profile` for each — returns star rating, HCAHPS, cost data
3. Use `get_hai_hospital` for infection details
4. Use `get_mortality_hospital` for death rates
5. Use `get_vbp_hospital` for value-based purchasing scores
6. Use `get_episode_spending` for episode cost breakdown

**"What's the safest hospital in [state]?"**
1. Use `get_quality_composite_list` with state filter — returns PSI-90, HAC, infection SIRs, readmissions, mortality for all hospitals
2. Sort mentally by lowest PSI-90 or HAC score; cross-reference with star rating

**"Which hospital has the best value in [state]?"**
1. Use `get_value_composite` with state filter — returns quality + VBP + MSPB + episode cost for all hospitals
2. Look for high VBP total score, low MSPB (< 1.0), and high star rating

**"How expensive is [procedure] in [area]?"**
1. Use `search_drgs` to find the DRG code (searches all ~750 DRGs by keyword)
2. Use `estimate_procedure_cost` with the DRG + state or ZIP — returns per-hospital pricing with distance, star rating, and patient experience
3. Use `get_cost_stats` for national averages, `get_top_expensive_zips` for geographic price variation
4. Use `get_state_cost_summary` for state-level comparison

**"I need [procedure] near [location] — what's my best option?"**
1. Use `search_drgs` to find the DRG code for the procedure
2. Use `estimate_procedure_cost` with the DRG + ZIP + radius — returns hospitals sorted by payment, distance, or star rating, with distance in miles
3. Recommend top hospitals by balancing cost, quality (star rating), and convenience (distance)

**"Find hospitals near me / near ZIP [xxxxx]"**
1. Use `find_nearby_hospitals` with ZIP and radius — returns hospitals with quality composite scores and distance in miles
2. Cross-reference with cost data using `get_hospital_profile` for specific facilities

**"How has the cost of [procedure] changed over time?"**
1. Use `get_top_drgs` to find the DRG code
2. Use `get_drg_trend` with the DRG — returns 11 years of cost data (2013-2023)
3. Use `get_state_drg_trend` for state-specific trends
4. Use `get_national_trend` for overall Medicare cost trajectory

**"How has [hospital]'s costs changed over time?"**
1. Use `search_hospitals` to find the CCN
2. Use `get_provider_trend` — returns 11 years of aggregate cost data for that hospital

**"Tell me about physician services in ZIP [xxxxx]"**
1. Use `get_physician_zip_summary` with the ZIP — returns HCPCS codes, charges, Medicare payments, provider counts

**"Find a cardiologist in [state]"**
1. Use `search_clinicians` with specialty="Cardiology" and state filter

**"What are post-acute care options in [state]?"**
1. Use `get_post_acute_landscape` for state-level overview of nursing homes, home health, dialysis, IRF, LTCH
2. Use `get_nursing_homes`, `get_home_health_agencies`, `get_dialysis_facilities` for facility-level detail
3. Use `get_irf_facilities` or `get_ltch_facilities` for specialized rehabilitation and long-term care options

**"Find a medical equipment supplier in [state]"**
1. Use `search_medical_equipment_suppliers` with state filter or keyword search for specific supply types

**"What are infection rates nationally?"**
1. Use `get_hai_national_summary` — returns per-measure SIR averages and distributions

**"Which hospitals have the worst readmissions?"**
1. Use `get_readmission_penalties` — returns hospitals ranked by excess readmission ratio with penalty status

**"Which hospitals have the worst HAC scores / patient safety?"**
1. Use `get_psi_list` with optional state filter — returns hospital-level HAC scores, PSI-90 values, payment reduction status, and infection SIRs

### Data Limitations

- Current quality/cost data is from **CMS 2023** — one year snapshot
- Historical inpatient data spans **2013-2023** (11 years) for trend analysis
- Only **Medicare-certified hospitals** are included (~4,700 facilities)
- Star ratings are NULL for ~2,000 hospitals (specialty, psychiatric, VA)
- VBP scores available for ~2,500 hospitals (not all qualify for the program)
- Physician data covers Medicare fee-for-service claims only (not Medicare Advantage, Medicaid, or private insurance)
- Clinician directory has ~2.7M entries; some clinicians appear multiple times (multiple practice locations)
- ZIP-level demographics from Census ACS 5-year estimates (not exact annual figures)
- Small hospitals may have suppressed data (marked with footnotes) for patient privacy
- Post-acute care data (nursing homes, home health, hospice, dialysis) reflects the most recent CMS reporting period

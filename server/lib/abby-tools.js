/**
 * Abby Analytics — Tool Catalog
 *
 * Each tool maps to an existing MediCosts API endpoint.
 * The LLM sees name + description + parameters (serialized into the system prompt).
 * The executor resolves path params, builds query strings, and calls the internal API.
 */

import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 3090;
const BASE = `http://localhost:${PORT}`;

// Generate a long-lived service token for internal API calls
// This avoids needing to pass user tokens through tool execution
function getServiceToken() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return jwt.sign(
    { id: 0, email: 'abby@internal', role: 'admin' },
    secret,
    { expiresIn: '1d' }
  );
}

let _serviceToken = null;
function serviceToken() {
  if (!_serviceToken) _serviceToken = getServiceToken();
  return _serviceToken;
}

export const TOOLS = [
  /* ── Hospital Search & Profiles ────────────────────────────── */
  {
    name: 'search_hospitals',
    description: 'Search for hospitals by name. Returns facility_id (CCN), name, city, state, and star rating. Use this to find a hospital before looking up details.',
    parameters: {
      q: { type: 'string', required: true, description: 'Hospital name search term (min 2 chars)' },
      limit: { type: 'number', description: 'Max results (default 20, max 50)' },
    },
    endpoint: '/api/quality/search',
  },
  {
    name: 'get_hospital_profile',
    description: 'Get a single hospital\'s full quality composite profile including star rating, PSI-90 score, readmission ratio, mortality rate, cost data, and more. Requires facility_id (CCN).',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN), e.g. "050454"' },
    },
    endpoint: '/api/quality/composite/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_quality_composite_list',
    description: 'List hospitals with quality composite data. Filterable by state and minimum star rating. Sortable by star_rating, psi_90_score, avg_excess_readm_ratio, avg_mortality_rate, weighted_avg_payment, or facility_name.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code, e.g. "CA"' },
      min_stars: { type: 'number', description: 'Minimum star rating (1-5)' },
      sort: { type: 'string', description: 'Sort column (default: star_rating)' },
      order: { type: 'string', description: '"asc" or "desc" (default: desc)' },
      limit: { type: 'number', description: 'Max results (default 200, max 500)' },
    },
    endpoint: '/api/quality/composite',
  },
  {
    name: 'get_paginated_hospitals',
    description: 'Paginated hospital list with quality fields. Good for browsing all hospitals in a state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      page: { type: 'number', description: 'Page number (default 1)' },
      per_page: { type: 'number', description: 'Results per page (default 50, max 100)' },
      sort: { type: 'string', description: 'Sort column' },
      order: { type: 'string', description: '"asc" or "desc"' },
    },
    endpoint: '/api/quality/hospitals',
  },

  /* ── Infection Rates (HAI) ─────────────────────────────────── */
  {
    name: 'get_hai_national_summary',
    description: 'National summary of Healthcare-Associated Infection (HAI) rates. Returns average and median SIR for each HAI measure (CLABSI, CAUTI, SSI, MRSA, CDI), plus counts of hospitals performing better/worse than national benchmark.',
    parameters: {},
    endpoint: '/api/quality/hai/national-summary',
  },
  {
    name: 'get_hai_hospital',
    description: 'Get HAI (infection) data for a specific hospital. Returns SIR scores and national comparison for each infection type.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/quality/hai/hospital/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'compare_hospitals_hai',
    description: 'Compare HAI (infection) rates across 2-5 hospitals side by side. Returns SIR scores for each facility and measure.',
    parameters: {
      facilities: { type: 'string', required: true, description: 'Comma-separated facility IDs (CCNs), e.g. "050454,330214,360180"' },
    },
    endpoint: '/api/quality/hai/compare',
  },

  /* ── Readmissions ──────────────────────────────────────────── */
  {
    name: 'get_readmission_summary',
    description: 'National readmission summary by condition. Shows average excess readmission ratio, penalized vs non-penalized hospital counts.',
    parameters: {},
    endpoint: '/api/quality/readmissions/summary',
  },
  {
    name: 'get_readmission_hospital',
    description: 'Get readmission data for a specific hospital. Returns excess readmission ratio, predicted and expected rates by condition.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/quality/readmissions/hospital/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_readmission_penalties',
    description: 'List hospitals penalized for excess readmissions (ratio > 1.0). Filterable by state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default 50)' },
    },
    endpoint: '/api/quality/readmissions/penalties',
  },

  /* ── Patient Safety (PSI / HAC) ────────────────────────────── */
  {
    name: 'get_psi_summary',
    description: 'National Patient Safety Indicator (PSI-90) and Hospital-Acquired Condition (HAC) summary. Returns average scores, penalized hospital counts.',
    parameters: {},
    endpoint: '/api/quality/psi/summary',
  },
  {
    name: 'get_psi_hospital',
    description: 'Get PSI-90 and HAC scores for a specific hospital, including individual infection z-scores and payment reduction status.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/quality/psi/hospital/:ccn',
    pathParams: ['ccn'],
  },

  /* ── Mortality ─────────────────────────────────────────────── */
  {
    name: 'get_mortality_summary',
    description: 'National mortality rate summary by condition (AMI, HF, pneumonia, COPD, stroke, CABG). Shows average rates and better/worse than national counts.',
    parameters: {},
    endpoint: '/api/quality/mortality/summary',
  },
  {
    name: 'get_mortality_hospital',
    description: 'Get mortality/complications data for a specific hospital by condition.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/quality/mortality/hospital/:ccn',
    pathParams: ['ccn'],
  },

  /* ── Timely & Effective Care ───────────────────────────────── */
  {
    name: 'get_timely_care_hospital',
    description: 'Get timely & effective care measures for a hospital (ED wait times, stroke care, immunization, etc.).',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/quality/timely-care/hospital/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_ed_wait_comparison',
    description: 'Compare ED wait times across hospitals. Filterable by state. Returns ED_1b (median ED time), ED_2b (admit decision to departure), OP_18b (median ED time for patients sent home).',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
    },
    endpoint: '/api/quality/timely-care/ed-comparison',
  },

  /* ── Cost Data ─────────────────────────────────────────────── */
  {
    name: 'get_top_drgs',
    description: 'Top 50 most expensive DRGs (Diagnosis Related Groups) nationally, with weighted average charges, payments, and discharge counts.',
    parameters: {},
    endpoint: '/api/drgs/top50',
  },
  {
    name: 'get_cost_stats',
    description: 'Summary statistics for a specific DRG or all DRGs: average payment, total discharges, provider count, unique ZIPs.',
    parameters: {
      drg: { type: 'string', description: 'DRG code, e.g. "870" or "ALL" (default)' },
    },
    endpoint: '/api/stats',
  },
  {
    name: 'get_state_cost_summary',
    description: 'State-level average charges, payments, and discharge counts. Filterable by DRG. Great for geographic cost comparison.',
    parameters: {
      drg: { type: 'string', description: 'DRG code or "ALL"' },
    },
    endpoint: '/api/states/summary',
  },
  {
    name: 'get_top_expensive_zips',
    description: 'Top 50 most expensive ZIP codes by average payment or charges for a DRG.',
    parameters: {
      drg: { type: 'string', description: 'DRG code or "ALL"' },
      metric: { type: 'string', description: '"payment" or "charge" (default: payment)' },
    },
    endpoint: '/api/zips/top50',
  },
  {
    name: 'get_cost_vs_stars',
    description: 'Hospital cost vs star rating scatter data. Shows relationship between quality rating and average Medicare payment.',
    parameters: {},
    endpoint: '/api/quality/cost-vs-stars',
  },

  /* ── Geographic & Demographic ──────────────────────────────── */
  {
    name: 'get_state_quality_summary',
    description: 'Per-state quality summary (average star rating, HAI rates, readmission ratios, etc.).',
    parameters: {},
    endpoint: '/api/quality/state-summary',
  },
  {
    name: 'get_zip_demographics',
    description: 'Demographics for a ZIP code (population, median income, poverty rate, racial/ethnic composition, insurance coverage).',
    parameters: {
      zip: { type: 'string', required: true, description: '5-digit ZIP code' },
    },
    endpoint: '/api/demographics/zip/:zip',
    pathParams: ['zip'],
  },

  /* ── Physician Data ────────────────────────────────────────── */
  {
    name: 'get_physician_top_services',
    description: 'Top physician-administered services (HCPCS codes) nationally by total cost.',
    parameters: {},
    endpoint: '/api/physician/top-hcpcs',
  },
  {
    name: 'get_physician_zip_summary',
    description: 'Top physician services in a specific ZIP code.',
    parameters: {
      zip: { type: 'string', required: true, description: '5-digit ZIP code' },
    },
    endpoint: '/api/physician/zip-summary',
  },

  /* ── Outpatient Data ───────────────────────────────────────── */
  {
    name: 'get_outpatient_top_services',
    description: 'Top outpatient services (HCPCS codes) by cost, optionally filtered by state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
    },
    endpoint: '/api/outpatient/top-hcpcs',
  },
  {
    name: 'get_outpatient_hospital',
    description: 'Outpatient services for a specific hospital.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/outpatient/provider/:ccn',
    pathParams: ['ccn'],
  },

  /* ── Historical Cost Trends (2013-2023) ──────────────────────── */
  {
    name: 'get_drg_trend',
    description: 'Yearly cost trend for a specific DRG from 2013-2023. Returns weighted average payment, charges, Medicare payment, discharge count, and provider count per year.',
    parameters: {
      drg: { type: 'string', required: true, description: 'DRG code, e.g. "470"' },
    },
    endpoint: '/api/trends/drg',
  },
  {
    name: 'get_provider_trend',
    description: 'Hospital-level yearly cost trend from 2013-2023. Returns aggregate payment, charges, discharges, and DRG count per year for one hospital.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/trends/provider',
  },
  {
    name: 'get_state_drg_trend',
    description: 'State-level yearly cost trend for a DRG from 2013-2023.',
    parameters: {
      state: { type: 'string', required: true, description: 'Two-letter state code' },
      drg: { type: 'string', required: true, description: 'DRG code' },
    },
    endpoint: '/api/trends/state',
  },
  {
    name: 'get_national_trend',
    description: 'National top-line cost summary per year (2013-2023). Weighted average payment and charges across all DRGs, total discharges.',
    parameters: {},
    endpoint: '/api/trends/national',
  },

  /* ── Episode Spending & Value ────────────────────────────────── */
  {
    name: 'get_episode_spending',
    description: 'Spending breakdown by claim type and time period (pre-admission, during, post-discharge, complete episode) for a hospital. Compares hospital vs state vs national average.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/spending/episode/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_spending_per_beneficiary',
    description: 'Medicare Spending Per Beneficiary (MSPB-1) scores. 1.0 = national average; < 1.0 = cheaper than average. Filterable by state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default all)' },
    },
    endpoint: '/api/spending/per-beneficiary',
  },
  {
    name: 'get_vbp_hospital',
    description: 'Value-Based Purchasing (VBP) scores for a hospital across all 5 domains: clinical outcomes, person/community engagement, safety, efficiency, and total performance score. Also includes MSPB-1 and HCAHPS base/consistency scores.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/vbp/hospital/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_vbp_rankings',
    description: 'VBP total performance score rankings. Higher = better. Filterable by state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default all)' },
    },
    endpoint: '/api/vbp/rankings',
  },
  {
    name: 'get_unplanned_visits',
    description: 'Unplanned hospital visit measures for a hospital: 30-day readmissions (READM_30), excess days in acute care (EDAC_30), and outpatient ED visit rates. Includes confidence intervals and national comparison.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Hospital facility ID (CCN)' },
    },
    endpoint: '/api/unplanned-visits/hospital/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_value_composite',
    description: 'Comprehensive hospital value composite: quality metrics (star rating, PSI-90, HAC, infections, readmissions, mortality) + VBP scores + MSPB + unplanned visits + episode cost. The most complete single-hospital value assessment.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default all)' },
    },
    endpoint: '/api/value-composite',
  },

  /* ── Post-Acute Care ─────────────────────────────────────────── */
  {
    name: 'get_nursing_homes',
    description: 'List nursing homes with star ratings (overall, health inspection, quality measures, staffing), bed count, fines, and penalties. Filterable by state.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results' },
    },
    endpoint: '/api/post-acute/nursing-homes',
  },
  {
    name: 'get_nursing_home_profile',
    description: 'Detailed nursing home profile including ratings, staffing hours, turnover rates, fines, and all MDS quality measure scores.',
    parameters: {
      ccn: { type: 'string', required: true, description: 'Nursing home CCN' },
    },
    endpoint: '/api/post-acute/nursing-home/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_home_health_agencies',
    description: 'Home health agencies with quality star rating, discharge-to-community rate (DTC), potentially preventable readmission rate (PPR), potentially preventable hospitalization rate (PPH), and Medicare spend per episode.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results' },
    },
    endpoint: '/api/post-acute/home-health',
  },
  {
    name: 'get_hospice_providers',
    description: 'Hospice providers with quality measure scores (emotional support, symptom management, communication, etc.).',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results' },
    },
    endpoint: '/api/post-acute/hospice',
  },
  {
    name: 'get_dialysis_facilities',
    description: 'Dialysis facilities with 5-star rating, mortality/hospitalization/readmission/transfusion/ED visit rates, and chain organization info.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results' },
    },
    endpoint: '/api/post-acute/dialysis',
  },
  {
    name: 'get_post_acute_landscape',
    description: 'State-level post-acute care overview: counts and average ratings for nursing homes, home health agencies, and dialysis facilities. Useful for comparing post-acute care quality across states.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code (omit for all states)' },
    },
    endpoint: '/api/post-acute/landscape',
  },

  /* ── Specialized Facilities (IRF, LTCH, Suppliers) ──────────── */
  {
    name: 'get_irf_facilities',
    description: 'List Inpatient Rehabilitation Facilities (IRFs). Filterable by state. Returns CCN, name, city, state, ownership type, phone.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default 200)' },
    },
    endpoint: '/api/facilities/irf',
  },
  {
    name: 'get_irf_detail',
    description: 'Get IRF detail including quality measures (functional outcomes, discharge to community, etc.).',
    parameters: {
      ccn: { type: 'string', required: true, description: 'IRF facility CCN' },
    },
    endpoint: '/api/facilities/irf/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'get_ltch_facilities',
    description: 'List Long-Term Care Hospitals (LTCHs). Filterable by state. Returns CCN, name, city, state, ownership type, phone.',
    parameters: {
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default 200)' },
    },
    endpoint: '/api/facilities/ltch',
  },
  {
    name: 'get_ltch_detail',
    description: 'Get LTCH detail including quality measures (discharge to community, pressure ulcers, infections, etc.).',
    parameters: {
      ccn: { type: 'string', required: true, description: 'LTCH facility CCN' },
    },
    endpoint: '/api/facilities/ltch/:ccn',
    pathParams: ['ccn'],
  },
  {
    name: 'search_medical_equipment_suppliers',
    description: 'Search Medicare-enrolled medical equipment suppliers (DMEPOS). Search by name or supplies keyword. Filterable by state. Returns 58K+ suppliers with address, phone, specialties, and supply types.',
    parameters: {
      q: { type: 'string', description: 'Search by business name, practice name, or supplies keyword' },
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default 200)' },
    },
    endpoint: '/api/facilities/suppliers',
  },

  /* ── DRG Search & Cost Estimator ────────────────────────────── */
  {
    name: 'search_drgs',
    description: 'Search for DRGs (Diagnosis Related Groups) by keyword. Returns DRG code, description, number of hospitals, total discharges, and average payment. Use this to find the DRG code for a specific procedure or condition.',
    parameters: {
      q: { type: 'string', required: true, description: 'Search term (e.g. "knee replacement", "heart failure", "sepsis")' },
      limit: { type: 'number', description: 'Max results (default 20, max 50)' },
    },
    endpoint: '/api/drgs/search',
  },
  {
    name: 'estimate_procedure_cost',
    description: 'Find hospitals for a specific DRG procedure with cost estimates. Filterable by state or near a ZIP code with radius. Returns hospital name, location, distance (if ZIP), avg payment, markup ratio, star rating, HCAHPS patient rating, and discharge count. Sortable by payment, distance, star, or markup.',
    parameters: {
      drg: { type: 'string', required: true, description: 'DRG code (e.g. "470" for knee replacement)' },
      state: { type: 'string', description: 'Two-letter state code' },
      zip: { type: 'string', description: '5-digit ZIP code for distance-based search' },
      radius: { type: 'number', description: 'Search radius in miles (default 50)' },
      sort: { type: 'string', description: '"payment", "distance", "star", or "markup" (default: payment)' },
      order: { type: 'string', description: '"asc" or "desc" (default: asc)' },
      limit: { type: 'number', description: 'Max results (default 50, max 200)' },
    },
    endpoint: '/api/estimate',
  },
  {
    name: 'find_nearby_hospitals',
    description: 'Find hospitals near a ZIP code with quality metrics. Returns hospital name, distance, star rating, PSI-90, readmission ratio, mortality rate, avg payment, and hospital type. Great for location-based hospital discovery.',
    parameters: {
      zip: { type: 'string', required: true, description: '5-digit ZIP code' },
      radius: { type: 'number', description: 'Search radius in miles (default 50)' },
      sort: { type: 'string', description: '"star_rating", "distance_miles", or "weighted_avg_payment"' },
      limit: { type: 'number', description: 'Max results (default 25, max 100)' },
    },
    endpoint: '/api/hospitals/nearby',
  },

  /* ── Clinician Directory ─────────────────────────────────────── */
  {
    name: 'search_clinicians',
    description: 'Search the Medicare clinician directory (2.7M providers) by name, specialty, and state. Returns NPI, credentials, specialty, location, telehealth availability.',
    parameters: {
      q: { type: 'string', description: 'Name search term (searches first and last name)' },
      specialty: { type: 'string', description: 'Primary specialty, e.g. "Internal Medicine", "Cardiology"' },
      state: { type: 'string', description: 'Two-letter state code' },
      limit: { type: 'number', description: 'Max results (default 50)' },
    },
    endpoint: '/api/clinicians/search',
  },
  {
    name: 'get_clinician_profile',
    description: 'Get clinician details by NPI: name, credentials, medical school, graduation year, specialties, facility, telehealth, and assignment status.',
    parameters: {
      npi: { type: 'string', required: true, description: 'National Provider Identifier (10-digit NPI)' },
    },
    endpoint: '/api/clinicians/:npi',
    pathParams: ['npi'],
  },

  /* ── Open Payments (Sunshine Act) ──────────────────────────── */
  {
    name: 'get_physician_payments',
    description: 'Get pharmaceutical and medical device industry payments to a specific physician from the CMS Open Payments (Sunshine Act) database. Returns total received, number of payments, top payers, and payment breakdown by nature (consulting fees, food/beverage, travel, research, etc.).',
    parameters: {
      npi: { type: 'string', required: true, description: 'Physician NPI (10-digit National Provider Identifier)' },
      year: { type: 'number', description: 'Payment year (2023 or 2024). Omit for all years.' },
    },
    endpoint: '/api/payments/physician/:npi',
    pathParams: ['npi'],
  },
  {
    name: 'get_top_payment_recipients',
    description: 'Get the top recipients of industry payments (physicians, companies, hospitals, or by payment type). Shows leaderboard of who received/paid the most money from pharma and device manufacturers.',
    parameters: {
      by: { type: 'string', description: 'Group by: "physician" (default), "payer" (companies), "nature" (payment type), or "hospital"' },
      year: { type: 'number', description: 'Payment year (2023 or 2024). Omit for all years.' },
      limit: { type: 'number', description: 'Max results (default 25, max 50)' },
    },
    endpoint: '/api/payments/top',
  },
  {
    name: 'get_payments_summary',
    description: 'Get national Open Payments summary statistics: total payments, total amount, breakdown by year, by payment nature, and by state. Useful for context on the scale of industry payments to physicians.',
    parameters: {},
    endpoint: '/api/payments/summary',
  },
  {
    name: 'search_payments',
    description: 'Search Open Payments data by physician name or company/manufacturer name. Returns matching physicians with their total payments received, and matching payers with total payments made.',
    parameters: {
      q: { type: 'string', required: true, description: 'Search query — physician name or company name (min 2 chars)' },
    },
    endpoint: '/api/payments/search',
  },
];

/**
 * Convert TOOLS to Anthropic-native tool_use format.
 * https://docs.anthropic.com/en/docs/tool-use
 */
export function buildAnthropicTools() {
  return TOOLS.map(t => {
    const properties = {};
    const required = [];

    for (const [name, p] of Object.entries(t.parameters || {})) {
      properties[name] = {
        type: p.type === 'number' ? 'number' : 'string',
        description: p.description,
      };
      if (p.required) required.push(name);
    }

    return {
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
      },
    };
  });
}

/**
 * Execute a tool call against the internal API.
 * @param {string} toolName
 * @param {Object} args — parameter values from the LLM
 * @returns {Promise<{ok: boolean, data: any}>}
 */
export async function executeTool(toolName, args = {}) {
  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool) return { ok: false, data: { error: `Unknown tool: ${toolName}` } };

  // Build URL: replace path params, then append remaining as query string
  let url = tool.endpoint;
  const queryParams = { ...args };

  if (tool.pathParams) {
    for (const p of tool.pathParams) {
      url = url.replace(`:${p}`, encodeURIComponent(args[p] || ''));
      delete queryParams[p];
    }
  }

  const qs = Object.entries(queryParams)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const fullUrl = `${BASE}${url}${qs ? '?' + qs : ''}`;

  const headers = { 'Content-Type': 'application/json' };
  const token = serviceToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const resp = await fetch(fullUrl, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, data: { error: `API ${resp.status}: ${text}` } };
    }
    let data = await resp.json();

    // Truncate large arrays to keep LLM context manageable
    if (Array.isArray(data) && data.length > 30) {
      data = { results: data.slice(0, 30), truncated: true, total: data.length };
    }
    if (data?.data && Array.isArray(data.data) && data.data.length > 30) {
      data = { ...data, data: data.data.slice(0, 30), truncated: true };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, data: { error: `Fetch failed: ${err.message}` } };
  }
}

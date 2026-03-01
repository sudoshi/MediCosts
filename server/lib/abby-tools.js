/**
 * Abby Analytics — Tool Catalog
 *
 * Each tool maps to an existing MediCosts API endpoint.
 * The LLM sees name + description + parameters (serialized into the system prompt).
 * The executor resolves path params, builds query strings, and calls the internal API.
 */

const PORT = process.env.PORT || 3090;
const BASE = `http://localhost:${PORT}`;

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
];

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

  try {
    const resp = await fetch(fullUrl);
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

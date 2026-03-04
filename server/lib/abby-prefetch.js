/**
 * Page-aware data prefetch for tool-less models (e.g. MedGemma, Ollama models without function calling).
 *
 * Maps each page context to a list of tools to pre-execute.
 * Results are injected into the system prompt so the model has live DB data
 * even without being able to call tools itself.
 */

import { executeTool } from './abby-tools.js';

// Per-page: which tools to call automatically (no user input needed)
const PAGE_PREFETCH = {
  'Overview Dashboard': [
    { name: 'get_national_trend',      args: {} },
    { name: 'get_psi_summary',         args: {} },
    { name: 'get_readmission_summary', args: {} },
    { name: 'get_mortality_summary',   args: {} },
  ],
  'Quality Command Center': [
    { name: 'get_psi_summary',         args: {} },
    { name: 'get_readmission_summary', args: {} },
    { name: 'get_mortality_summary',   args: {} },
    { name: 'get_hai_national_summary',args: {} },
  ],
  'Best of the Best': [
    { name: 'get_quality_composite_list', args: { sort: 'star_rating', order: 'desc', limit: 25 } },
  ],
  'Accountability Dashboard': [
    { name: 'get_readmission_penalties', args: { limit: 20 } },
    { name: 'get_psi_summary',           args: {} },
    { name: 'get_quality_composite_list', args: { sort: 'psi_90_score', order: 'desc', limit: 20 } },
  ],
  'Hospital Compare': [
    { name: 'get_quality_composite_list', args: { sort: 'star_rating', order: 'desc', limit: 20 } },
  ],
  'Cost Trends': [
    { name: 'get_national_trend', args: {} },
    { name: 'get_top_drgs',       args: {} },
  ],
  'Spending & Value': [
    { name: 'get_spending_per_beneficiary', args: { limit: 25 } },
    { name: 'get_vbp_rankings',             args: { limit: 25 } },
  ],
  'Drug Spending': [
    { name: 'get_top_drgs',             args: {} },
    { name: 'get_physician_top_services', args: {} },
  ],
  'Hospital Financials': [
    { name: 'get_national_trend', args: {} },
  ],
  'Industry Payments': [
    { name: 'get_payments_summary',       args: {} },
    { name: 'get_top_payment_recipients', args: { by: 'physician', limit: 15 } },
    { name: 'get_top_payment_recipients', args: { by: 'payer',     limit: 15 } },
  ],
  'Hospital Explorer': [
    { name: 'get_quality_composite_list', args: { sort: 'star_rating', order: 'desc', limit: 25 } },
    { name: 'get_state_quality_summary',  args: {} },
  ],
  'Clinician Directory': [
    { name: 'get_physician_top_services', args: {} },
  ],
  'Post-Acute Care': [
    { name: 'get_post_acute_landscape', args: {} },
    { name: 'get_nursing_homes',        args: { limit: 20 } },
    { name: 'get_dialysis_facilities',  args: { limit: 20 } },
  ],
  'Physician Analytics': [
    { name: 'get_physician_top_services',   args: {} },
    { name: 'get_outpatient_top_services',  args: {} },
  ],
  'Geographic Analysis': [
    { name: 'get_state_quality_summary', args: {} },
    { name: 'get_state_cost_summary',    args: {} },
  ],
  'For Patients': [
    { name: 'get_quality_composite_list', args: { sort: 'star_rating', order: 'desc', limit: 20 } },
  ],
  'Cost Estimator': [
    { name: 'get_top_drgs', args: {} },
  ],
};

/**
 * Pre-fetch live DB data for a page and return it as a formatted string
 * to inject into the system prompt.
 *
 * @param {string} pageContext - page name matching PAGE_PREFETCH keys
 * @returns {Promise<string>} formatted data block, or '' if nothing to fetch
 */
export async function prefetchPageData(pageContext) {
  const tasks = PAGE_PREFETCH[pageContext];
  if (!tasks?.length) return '';

  const sections = [];

  await Promise.all(tasks.map(async ({ name, args }) => {
    const result = await executeTool(name, args);
    if (!result.ok) return;

    const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const json = JSON.stringify(result.data, null, 2);
    // Truncate very large responses to keep context manageable
    const truncated = json.length > 6000 ? json.slice(0, 6000) + '\n  ... (truncated)' : json;
    sections.push(`### ${label}\n\`\`\`json\n${truncated}\n\`\`\``);
  }));

  if (!sections.length) return '';

  return `\n\n## Live Data from MediCosts Database\nThe following data was automatically fetched from the database for the **${pageContext}** page. Use it to answer the user's question accurately.\n\n${sections.join('\n\n')}`;
}

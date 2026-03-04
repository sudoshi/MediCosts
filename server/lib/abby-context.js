/**
 * Rich page context descriptions injected into Abby's system prompt.
 * Keys match the pageContext values sent by AbbyPanel.
 */

export const PAGE_DESCRIPTIONS = {
  'Overview Dashboard': `National KPIs summary: average hospital markup ratio (~5.2×), total hospitals penalized by CMS, safety failure counts, and avg patient star rating. Data comes from merged DRG, HAC, HRRP, and HCAHPS datasets.`,

  'Quality Command Center': `PSI-90 composite safety scores, HCAHPS patient experience ratings, and HRRP readmission penalties. Shows state-filterable leaderboards of worst-performing facilities. PSI-90 is CMS's Patient Safety Indicator composite.`,

  'Best of the Best': `Top-performing hospitals by composite excellence score (30% star rating, 30% PSI-90 safety, 25% readmissions, 15% mortality). Spotlights best patient rating, safest facility, best readmission ratio.`,

  'Accountability Dashboard': `Worst performers: highest charge-to-payment markup ratios, most severe HRRP readmission penalties, and highest HAC patient safety scores. HAC = Hospital Acquired Conditions.`,

  'Hospital Compare': `Side-by-side comparison of up to 4 hospitals across quality, cost, safety, and patient experience metrics.`,

  'Cost Trends': `DRG-level Medicare cost trends. DRGs are Diagnosis-Related Groups — fixed payment categories CMS uses to reimburse hospitals. Shows historical charge and payment patterns.`,

  'Spending & Value': `Medicare spending patterns, cost efficiency, and value-based purchasing metrics across facilities and geographies.`,

  'Drug Spending': `Part D Medicare drug spending: 14,000+ drugs, 1.4M prescribers, total Medicare costs. Filterable by drug name and prescriber NPI.`,

  'Hospital Financials': `Hospital cost report data including total costs, charges, and Medicare revenue for participating facilities.`,

  'Industry Payments': `Open Payments data: $6.6B in disclosed payments from pharma/device companies to physicians and hospitals (2023–2024). Searchable by company, recipient, and payment category.`,

  'Hospital Explorer': `Search and filter 5,400+ Medicare hospitals by name, state, quality rating, and DRG costs. Key metrics: star ratings (1–5), average charges, payment ratios.`,

  'Clinician Directory': `Search 2.7M Medicare providers by name, NPI, specialty, and location. Links to Open Payments industry data and Part D prescribing patterns.`,

  'Post-Acute Care': `Nursing homes, home health agencies, hospice providers, dialysis centers, and inpatient rehab facilities. Includes quality ratings and inspection data.`,

  'Physician Analytics': `Medicare Part B utilization and spending by physician and HCPCS procedure code. Shows volume, average charge, and Medicare payment.`,

  'Geographic Analysis': `State-level patterns in Medicare cost, quality, and utilization. Map-based visualization showing geographic variation across the US.`,

  'For Patients': `Patient-friendly hospital information, quality ratings, and cost estimates. Designed for consumers making healthcare decisions.`,

  'Cost Estimator': `Estimate Medicare procedure costs at specific hospitals by DRG or procedure code. Compare facility charges vs typical Medicare payments.`,
};

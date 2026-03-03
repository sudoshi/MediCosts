/**
 * AboutView — Data sources, methodology, and legal context.
 * Route: /about
 */

import s from './AboutView.module.css';

const DATA_SOURCES = [
  {
    name: 'CMS Medicare Inpatient Charges',
    agency: 'Centers for Medicare & Medicaid Services',
    url: 'https://www.cms.gov/Research-Statistics-Data-and-Systems/Statistics-Trends-and-Reports/Medicare-Provider-Charge-Data',
    year: '2023',
    rows: '146,427',
    desc: 'Hospital-level DRG charges and Medicare payments for all IPPS hospitals. Basis for cost estimator and charge benchmarking.',
  },
  {
    name: 'CMS Hospital Quality Initiative (HCAHPS, Safety, Readmissions)',
    agency: 'CMS Provider Data Catalog',
    url: 'https://data.cms.gov/provider-data/',
    year: '2023–2024',
    rows: '4,000+ hospitals',
    desc: 'Composite quality scores, 5-star ratings, patient safety indicators (PSI-90), HAI infection rates, readmission ratios, mortality rates, and patient experience (HCAHPS) scores.',
  },
  {
    name: 'CMS Open Payments (Sunshine Act)',
    agency: 'Centers for Medicare & Medicaid Services',
    url: 'https://openpaymentsdata.cms.gov/',
    year: 'PY2023–PY2024',
    rows: '30,085,830',
    desc: 'All general, research, and ownership payments from pharmaceutical and medical device manufacturers to physicians and teaching hospitals. Mandated by the Physician Payments Sunshine Act (42 U.S.C. §1320a-7h).',
  },
  {
    name: 'HCRIS Hospital Cost Reports',
    agency: 'CMS Healthcare Cost Report Information System',
    url: 'https://www.cms.gov/Research-Statistics-Data-and-Systems/Downloadable-Public-Use-Files/Cost-Reports',
    year: 'FY2023–FY2024',
    rows: '11,584',
    desc: 'Financial statements Medicare-certified hospitals are required to file annually. Source for gross charges, inpatient charges, bed counts, inpatient days, occupancy, and uncompensated care costs.',
  },
  {
    name: 'HRSA Health Professional Shortage Areas (HPSA)',
    agency: 'Health Resources & Services Administration',
    url: 'https://data.hrsa.gov/topics/health-workforce/shortage-areas',
    year: '2024',
    rows: '88,089',
    desc: 'HRSA-designated geographic areas, population groups, and facilities with shortages of primary care, dental health, or mental health professionals. HPSA Score 0–25 indicates severity of shortage.',
  },
  {
    name: 'CDC PLACES: Local Data for Better Health',
    agency: 'Centers for Disease Control and Prevention',
    url: 'https://www.cdc.gov/places/',
    year: '2023',
    rows: '32,520 ZCTAs',
    desc: 'ZIP-level crude prevalence estimates for 26 health measures: chronic disease (diabetes, obesity, heart disease, COPD, stroke), health risk behaviors (smoking, binge drinking, physical inactivity), and prevention measures (uninsured rate, annual checkup).',
  },
  {
    name: 'NPPES National Provider Identifier (NPI) Registry',
    agency: 'CMS National Plan and Provider Enumeration System',
    url: 'https://npiregistry.cms.hhs.gov/',
    year: '2024',
    rows: '2.7M active providers',
    desc: 'The authoritative directory of all US healthcare providers with active NPIs. Basis for the Clinician Directory including specialty, practice address, and organization affiliation.',
  },
  {
    name: 'CMS Post-Acute Care Datasets',
    agency: 'CMS Provider Data Catalog',
    url: 'https://data.cms.gov/provider-data/',
    year: '2023–2024',
    rows: 'Multiple',
    desc: 'Nursing home quality ratings (Five-Star), dialysis facility compare, home health quality, hospice quality, inpatient rehabilitation (IRF), and long-term care hospital (LTCH) outcomes.',
  },
];

const METHODOLOGY_ITEMS = [
  {
    title: 'Hospital Composite Score',
    body: 'Each hospital receives a composite score combining: CMS 5-star overall rating (weighted 40%), PSI-90 patient safety indicator score (20%), readmission ratio vs. national average (20%), and HCAHPS patient experience composite (20%). Scores are normalized to 0–100 scale.',
  },
  {
    title: 'Charge Markup Ratio',
    body: 'Calculated as (average gross charges) ÷ (average Medicare payment) for a given DRG. Medicare payment represents the government\'s assessment of fair cost for the procedure. Ratios above 3.0× indicate significant price opacity.',
  },
  {
    title: 'HPSA Score Interpretation',
    body: 'HRSA HPSA scores range 0–25. A score ≥10 qualifies an area for certain federal assistance programs. We display any "Designated" status areas as active shortage warnings; "Withdrawn" designations are excluded.',
  },
  {
    title: 'CDC PLACES Prevalence',
    body: 'All CDC PLACES figures use crude prevalence (CrdPrv) estimates — the raw percentage of the adult population (18+) reporting the condition, without age-standardization. Age-adjusted figures are also available in the dataset but not currently displayed.',
  },
  {
    title: 'Open Payments Aggregation',
    body: 'Payments are summed per physician NPI across all payment types (General, Research, Ownership). Multi-year sums cover PY2023 and PY2024 combined. Payment types include food/beverage, travel, consulting fees, speaker programs, education, and research funding.',
  },
  {
    title: 'Geographic Analysis',
    body: 'ZIP-to-hospital proximity uses Haversine distance on lat/lng coordinates from provider address records. State-level summaries use the hospital\'s registered state, not the patient\'s ZIP.',
  },
];

export default function AboutView() {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>About & Methodology</h1>
        <p className={s.subtitle}>
          How MediCosts collects, processes, and presents healthcare cost and quality data — and what it means.
        </p>
      </div>

      {/* Mission */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Mission</h2>
        <p className={s.body}>
          MediCosts exists because healthcare pricing in the US is deliberately opaque. Hospitals charge wildly
          different amounts for identical procedures, pharmaceutical companies spend billions influencing physician
          prescribing, and communities with the greatest health needs often have the fewest providers. The federal
          government legally mandates that much of this information be public — but the raw files are unusable
          without significant technical work.
        </p>
        <p className={s.body}>
          We do that technical work, then give you the results in a searchable, comparable interface. No paywalls,
          no proprietary data, no hidden methodology. Every number on this site traces directly to a government
          dataset linked below.
        </p>
      </section>

      {/* Legal */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Legal & Privacy</h2>
        <div className={s.legalCards}>
          <div className={s.legalCard}>
            <span className={s.legalIcon}>✓</span>
            <div>
              <strong>No patient data.</strong> All data is provider-level and facility-level. No individual patient
              records, diagnoses, or claims data are stored or displayed. HIPAA does not apply.
            </div>
          </div>
          <div className={s.legalCard}>
            <span className={s.legalIcon}>✓</span>
            <div>
              <strong>Legally mandated disclosures.</strong> Hospital charge data (45 CFR §180), Open Payments
              (42 U.S.C. §1320a-7h), and Transparency in Coverage (45 CFR §147.211) are all federally required
              public disclosures. This data was collected specifically for public use.
            </div>
          </div>
          <div className={s.legalCard}>
            <span className={s.legalIcon}>✓</span>
            <div>
              <strong>No affiliation.</strong> MediCosts is not affiliated with CMS, HRSA, CDC, HHS, or any insurance
              company. We are an independent transparency tool.
            </div>
          </div>
          <div className={s.legalCard}>
            <span className={s.legalIcon}>⚠</span>
            <div>
              <strong>Data limitations.</strong> Hospital charges are not what patients actually pay. Actual patient
              cost depends on insurance coverage, negotiated rates, and financial assistance programs. Always verify
              current network status and pricing with your insurer and provider before receiving care.
            </div>
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Data Sources</h2>
        <p className={s.body}>All datasets are refreshed when CMS publishes updates. Last full load: March 2026.</p>
        <div className={s.sourceList}>
          {DATA_SOURCES.map((d, i) => (
            <div key={i} className={s.sourceRow}>
              <div className={s.sourceHeader}>
                <span className={s.sourceName}>{d.name}</span>
                <span className={s.sourceMeta}>{d.year} · {d.rows} records</span>
              </div>
              <div className={s.sourceAgency}>{d.agency}</div>
              <p className={s.sourceDesc}>{d.desc}</p>
              <a href={d.url} target="_blank" rel="noopener noreferrer" className={s.sourceLink}>
                Official dataset →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Methodology Notes</h2>
        <div className={s.methodList}>
          {METHODOLOGY_ITEMS.map((m, i) => (
            <div key={i} className={s.methodItem}>
              <h3 className={s.methodTitle}>{m.title}</h3>
              <p className={s.methodBody}>{m.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

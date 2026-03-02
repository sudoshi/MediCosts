import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import pg from 'pg';

const pool = new pg.Pool({ 
  password: process.env.PGPASSWORD,
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE
});

async function counts() {
  try {
    const datasets = [
      { name: 'Nursing homes (MDS Quality)', table: 'nursing_homes_including_rehab_services__mds_quality_measures' },
      { name: 'Nursing home VBP', table: 'nursing_homes_including_rehab_services__fy_2026_snf_vbp_a3d513a' },
      { name: 'Physician office visits (Cardiology)', table: 'physician_office_visit_costs__cardiology_office_visit_costs' },
      { name: 'Physician office visits (Internal Med)', table: 'physician_office_visit_costs__internal_medicine_office__915ee21' },
      { name: 'Home health agencies', table: 'home_health_services__home_health_care_agencies' },
      { name: 'Hospice provider data', table: 'hospice_care__hospice_provider_data' },
      { name: 'Dialysis facilities', table: 'dialysis_facilities__dialysis_facility_listing_by_facility' },
      { name: 'Hospital VBP Clinical', table: 'hospitals__hospital_value_based_purchasing_hvbp_clinica_423ff32' },
      { name: 'Hospital spending by claim', table: 'hospitals__medicare_hospital_spending_by_claim' },
      { name: 'Unplanned visits', table: 'hospitals__unplanned_hospital_visits_hospital' },
      { name: 'Maternal health', table: 'hospitals__maternal_health_hospital' },
      { name: 'Spending per beneficiary', table: 'hospitals__medicare_spending_per_beneficiary_hospital' },
      { name: 'MIPS (PY 2023)', table: 'doctors_and_clinicians__py_2023_clinician_public_report_7b2b074' },
    ];

    console.log('\n========== ROW COUNTS ==========\n');
    for (const ds of datasets) {
      const result = await pool.query(`SELECT COUNT(*) as cnt FROM stage."${ds.table}";`);
      console.log(`${ds.name.padEnd(45)} : ${result.rows[0].cnt}`);
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
  }
}

counts();

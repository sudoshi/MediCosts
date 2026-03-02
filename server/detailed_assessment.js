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

async function detailed() {
  try {
    // 1. Physician office visit details - 3 specialties
    console.log('\n========== PHYSICIAN OFFICE VISITS (3 SPECIALTIES) ==========\n');
    const specs = [
      'physician_office_visit_costs__cardiology_office_visit_costs',
      'physician_office_visit_costs__family_practice_office_vi_eb259a8',
      'physician_office_visit_costs__internal_medicine_office__915ee21'
    ];
    
    for (const tbl of specs) {
      console.log(`\n--- ${tbl.replace('physician_office_visit_costs__', '').substring(0, 40)} ---`);
      const sample = await pool.query(`
        SELECT * FROM stage."${tbl}" LIMIT 1;
      `);
      if (sample.rows.length > 0) {
        console.log(JSON.stringify(sample.rows[0], null, 2));
      }
      const cnt = await pool.query(`SELECT COUNT(*) FROM stage."${tbl}";`);
      console.log('Rows:', cnt.rows[0].count);
    }

    // 2. VBP details - all 5 hospital tables
    console.log('\n\n========== HOSPITAL VBP DETAILS (5 TABLES) ==========\n');
    const vbpTables = [
      'hospitals__hospital_value_based_purchasing_hvbp_clinica_423ff32',
      'hospitals__hospital_value_based_purchasing_hvbp_efficie_6b246cf',
      'hospitals__hospital_value_based_purchasing_hvbp_person__9b88524',
      'hospitals__hospital_value_based_purchasing_hvbp_safety',
      'hospitals__hospital_value_based_purchasing_hvbp_total_p_34e5944'
    ];
    
    for (const tbl of vbpTables) {
      console.log(`\n--- ${tbl.split('_hvbp_')[1]?.substring(0, 35) || tbl} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1
        ORDER BY ordinal_position;
      `, [tbl]);
      console.log('Columns:', cols.rows.slice(0, 10).map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${tbl}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const keys = Object.keys(sample.rows[0]).slice(0, 8);
        const partial = {};
        keys.forEach(k => { partial[k] = sample.rows[0][k]; });
        console.log('Sample:', partial);
      }
    }

    // 3. Hospital Spending by Claim - claim types and periods
    console.log('\n\n========== HOSPITAL SPENDING BY CLAIM DETAILS ==========\n');
    const claimTypes = await pool.query(`
      SELECT DISTINCT claim_type FROM stage.hospitals__medicare_hospital_spending_by_claim
      ORDER BY claim_type;
    `);
    console.log('Claim types:');
    claimTypes.rows.forEach(r => console.log('  -', r.claim_type));
    
    const periods = await pool.query(`
      SELECT DISTINCT period FROM stage.hospitals__medicare_hospital_spending_by_claim
      ORDER BY period;
    `);
    console.log('\nPeriods:');
    periods.rows.forEach(r => console.log('  -', r.period));
    
    const spending = await pool.query(`
      SELECT * FROM stage.hospitals__medicare_hospital_spending_by_claim LIMIT 1;
    `);
    console.log('\nFull sample:');
    console.log(JSON.stringify(spending.rows[0], null, 2));

    // 4. Unplanned Hospital Visits - measure IDs
    console.log('\n\n========== UNPLANNED HOSPITAL VISITS MEASURES ==========\n');
    const measures = await pool.query(`
      SELECT DISTINCT measure_id, measure_description
      FROM stage.hospitals__unplanned_hospital_visits_hospital
      ORDER BY measure_id;
    `);
    console.log('Measures:');
    measures.rows.forEach(r => console.log('  -', r.measure_id, ':', r.measure_description));

    // 5. Maternal Health details
    console.log('\n\n========== MATERNAL HEALTH DETAILS ==========\n');
    const maternalMeasures = await pool.query(`
      SELECT DISTINCT measure_id, measure_name
      FROM stage.hospitals__maternal_health_hospital
      ORDER BY measure_id;
    `);
    console.log('Measures:');
    maternalMeasures.rows.forEach(r => console.log('  -', r.measure_id, ':', r.measure_name));
    
    const maternal = await pool.query(`
      SELECT * FROM stage.hospitals__maternal_health_hospital LIMIT 1;
    `);
    console.log('\nSample row:');
    console.log(JSON.stringify(maternal.rows[0], null, 2));

    // 6. Nursing homes quality
    console.log('\n\n========== NURSING HOME MDS QUALITY MEASURES ==========\n');
    const mdsTable = 'nursing_homes_including_rehab_services__mds_quality_measures';
    const mdsCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = $1
      ORDER BY ordinal_position;
    `, [mdsTable]);
    console.log('Columns:', mdsCols.rows.map(c => c.column_name));
    
    const mds = await pool.query(`SELECT * FROM stage."${mdsTable}" LIMIT 1;`);
    console.log('\nSample:');
    console.log(JSON.stringify(mds.rows[0], null, 2).substring(0, 800));

    // 7. Home Health details
    console.log('\n\n========== HOME HEALTH CARE AGENCIES ==========\n');
    const hhCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'home_health_services__home_health_care_agencies'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', hhCols.rows.map(c => c.column_name));
    
    const hh = await pool.query(`
      SELECT * FROM stage.home_health_services__home_health_care_agencies LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(hh.rows[0], null, 2).substring(0, 800));

    // 8. Dialysis
    console.log('\n\n========== DIALYSIS FACILITY DETAILS ==========\n');
    const dialCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'dialysis_facilities__dialysis_facility_listing_by_facility'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', dialCols.rows.map(c => c.column_name));
    
    const dial = await pool.query(`
      SELECT * FROM stage.dialysis_facilities__dialysis_facility_listing_by_facility LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(dial.rows[0], null, 2).substring(0, 800));

    // 9. Hospice
    console.log('\n\n========== HOSPICE PROVIDER DATA ==========\n');
    const hospCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'hospice_care__hospice_provider_data'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', hospCols.rows.map(c => c.column_name));
    
    const hosp = await pool.query(`
      SELECT * FROM stage.hospice_care__hospice_provider_data LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(hosp.rows[0], null, 2).substring(0, 800));

    // 10. Doctors & Clinicians MIPS data
    console.log('\n\n========== DOCTORS & CLINICIANS MIPS DATA ==========\n');
    const mipsTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%py_2023%'
      ORDER BY table_name;
    `);
    console.log('MIPS/PY 2023 tables:', mipsTables.rows.slice(0, 5).map(r => r.table_name));
    
    if (mipsTables.rows.length > 0) {
      const tbl = mipsTables.rows[0].table_name;
      const mipsCols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1
        ORDER BY ordinal_position LIMIT 15;
      `, [tbl]);
      console.log('\nColumns (first 15):', mipsCols.rows.map(c => c.column_name));
      
      const mips = await pool.query(`SELECT * FROM stage."${tbl}" LIMIT 1;`);
      console.log('\nSample:');
      console.log(JSON.stringify(mips.rows[0], null, 2).substring(0, 1000));
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

detailed();

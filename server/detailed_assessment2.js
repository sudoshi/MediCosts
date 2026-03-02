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
    // Unplanned Hospital Visits - check actual columns
    console.log('\n========== UNPLANNED HOSPITAL VISITS ==========\n');
    const unplannedCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'hospitals__unplanned_hospital_visits_hospital'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', unplannedCols.rows.map(c => c.column_name));
    
    const measures = await pool.query(`
      SELECT DISTINCT measure_id FROM stage.hospitals__unplanned_hospital_visits_hospital
      ORDER BY measure_id LIMIT 10;
    `);
    console.log('\nSample measure IDs:', measures.rows.map(r => r.measure_id));
    
    const unplanned = await pool.query(`
      SELECT * FROM stage.hospitals__unplanned_hospital_visits_hospital LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(unplanned.rows[0], null, 2));

    // Maternal Health
    console.log('\n\n========== MATERNAL HEALTH ==========\n');
    const mMatCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'hospitals__maternal_health_hospital'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', mMatCols.rows.map(c => c.column_name));
    
    const maternalMeasures = await pool.query(`
      SELECT DISTINCT measure_id, measure_name FROM stage.hospitals__maternal_health_hospital
      ORDER BY measure_id;
    `);
    console.log('\nMeasures:');
    maternalMeasures.rows.slice(0, 5).forEach(r => console.log('  -', r.measure_id, ':', r.measure_name));
    
    const maternal = await pool.query(`
      SELECT * FROM stage.hospitals__maternal_health_hospital LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(maternal.rows[0], null, 2));

    // Nursing Homes - MDS Quality Measures
    console.log('\n\n========== NURSING HOME MDS QUALITY MEASURES ==========\n');
    const mdsCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'nursing_homes_including_rehab_services__mds_quality_measures'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', mdsCols.rows.map(c => c.column_name));
    
    const mds = await pool.query(`
      SELECT * FROM stage.nursing_homes_including_rehab_services__mds_quality_measures LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(mds.rows[0], null, 2));

    // Home Health
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
    console.log(JSON.stringify(hh.rows[0], null, 2));

    // Dialysis
    console.log('\n\n========== DIALYSIS FACILITY ==========\n');
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
    console.log(JSON.stringify(dial.rows[0], null, 2));

    // Hospice Provider Data
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
    console.log(JSON.stringify(hosp.rows[0], null, 2).substring(0, 1200));

    // Doctors & Clinicians - MIPS
    console.log('\n\n========== DOCTORS & CLINICIANS MIPS DATA (PY 2023) ==========\n');
    const mipsTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%py_2023%'
      ORDER BY table_name;
    `);
    console.log('MIPS tables:', mipsTables.rows.map(r => r.table_name));
    
    if (mipsTables.rows.length > 0) {
      const tbl = mipsTables.rows[0].table_name;
      console.log(`\n--- ${tbl.substring(40)} ---`);
      const mipsCols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1
        ORDER BY ordinal_position LIMIT 20;
      `, [tbl]);
      console.log('Columns:', mipsCols.rows.map(c => c.column_name));
      
      const mips = await pool.query(`SELECT * FROM stage."${tbl}" LIMIT 1;`);
      console.log('\nSample:');
      console.log(JSON.stringify(mips.rows[0], null, 2).substring(0, 1500));
    }

    // Spending per Beneficiary
    console.log('\n\n========== MEDICARE SPENDING PER BENEFICIARY (HOSPITAL) ==========\n');
    const spbCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'stage' AND table_name = 'hospitals__medicare_spending_per_beneficiary_hospital'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', spbCols.rows.map(c => c.column_name));
    
    const spb = await pool.query(`
      SELECT * FROM stage.hospitals__medicare_spending_per_beneficiary_hospital LIMIT 1;
    `);
    console.log('\nSample:');
    console.log(JSON.stringify(spb.rows[0], null, 2));

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

detailed();

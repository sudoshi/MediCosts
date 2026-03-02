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

async function assessDatasets() {
  try {
    console.log('\n========== DATASET ASSESSMENT REPORT ==========\n');

    // 1. Check all schemas and tables
    console.log('1. AVAILABLE SCHEMAS & TABLES\n');
    const schemata = await pool.query(`
      SELECT table_schema, COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'public')
      GROUP BY table_schema
      ORDER BY table_schema;
    `);
    console.log('Schemas:', schemata.rows);

    // 2. NEW DATASETS: Nursing Homes
    console.log('\n\n2. NURSING HOMES (nursing_homes__*)\n');
    const nhTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'nursing_homes'
      LIMIT 10;
    `);
    console.log('Tables:', nhTables.rows);
    
    if (nhTables.rows.length > 0) {
      const {table_name} = nhTables.rows[0];
      const cols = await pool.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'nursing_homes' AND table_name = $1
        LIMIT 10;
      `, [table_name]);
      console.log(`\n${table_name} columns:`, cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM nursing_homes."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        console.log(`Sample data:`, JSON.stringify(sample.rows[0], null, 2));
      }
    }

    // 3. DOCTORS & CLINICIANS: Check specialty tables
    console.log('\n\n3. DOCTORS & CLINICIANS (PHYSICIAN OFFICE VISITS)\n');
    const docTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'doctors_and_clinicians'
      AND table_name LIKE 'physician_office_visit_costs%'
      ORDER BY table_name;
    `);
    console.log('Physician Office Visit tables:', docTables.rows.map(r => r.table_name));

    // Sample 3 specialties
    const specialties = ['cardiology', 'family_practice', 'internal_medicine'];
    for (const spec of specialties) {
      try {
        const tableName = `physician_office_visit_costs_by_specialty_${spec}`;
        const cols = await pool.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'doctors_and_clinicians' AND table_name = $1;
        `, [tableName]);
        if (cols.rows.length > 0) {
          console.log(`\n${spec}:`);
          console.log(`  Columns:`, cols.rows.map(c => c.column_name));
          const sample = await pool.query(`
            SELECT * FROM doctors_and_clinicians."${tableName}" LIMIT 1;
          `);
          console.log(`  Sample:`, JSON.stringify(sample.rows[0], null, 2));
        }
      } catch (e) {
        console.log(`${spec} table not found`);
      }
    }

    // 4. VBP (Value-Based Purchasing)
    console.log('\n\n4. HOSPITALS VALUE-BASED PURCHASING\n');
    const vbpTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'hospitals' AND table_name LIKE '%hospital_value_based_purchasing%'
      ORDER BY table_name;
    `);
    console.log('VBP Tables:', vbpTables.rows.map(r => r.table_name));
    
    for (const {table_name} of vbpTables.rows.slice(0, 5)) {
      const sample = await pool.query(`
        SELECT * FROM hospitals."${table_name}" LIMIT 1;
      `);
      console.log(`\n${table_name}:`);
      console.log(JSON.stringify(sample.rows[0], null, 2));
    }

    // 5. Hospital Spending by Claim
    console.log('\n\n5. MEDICARE HOSPITAL SPENDING BY CLAIM\n');
    const claimCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'hospitals' AND table_name = 'medicare_hospital_spending_by_claim'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', claimCols.rows.map(c => c.column_name));
    
    const spendClaim = await pool.query(`
      SELECT * FROM hospitals.medicare_hospital_spending_by_claim LIMIT 1;
    `);
    console.log('\nSample:', JSON.stringify(spendClaim.rows[0], null, 2));
    
    const claimTypes = await pool.query(`
      SELECT DISTINCT claim_type FROM hospitals.medicare_hospital_spending_by_claim;
    `);
    console.log('\nClaim types available:', claimTypes.rows.map(r => r.claim_type));

    // 6. Unplanned Hospital Visits
    console.log('\n\n6. UNPLANNED HOSPITAL VISITS\n');
    const unplanned = await pool.query(`
      SELECT DISTINCT measure_id FROM hospitals.unplanned_hospital_visits_hospital ORDER BY measure_id;
    `);
    console.log('Measure IDs:', unplanned.rows.map(r => r.measure_id));
    
    const unplannedCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'hospitals' AND table_name = 'unplanned_hospital_visits_hospital';
    `);
    console.log('Columns:', unplannedCols.rows.map(c => c.column_name));
    
    const unplannedSample = await pool.query(`
      SELECT * FROM hospitals.unplanned_hospital_visits_hospital LIMIT 1;
    `);
    console.log('Sample:', JSON.stringify(unplannedSample.rows[0], null, 2));

    // 7. Maternal Health
    console.log('\n\n7. MATERNAL HEALTH HOSPITAL\n');
    const maternalCols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'hospitals' AND table_name = 'maternal_health_hospital'
      ORDER BY ordinal_position;
    `);
    console.log('Columns:', maternalCols.rows.map(c => c.column_name));
    
    const maternal = await pool.query(`
      SELECT * FROM hospitals.maternal_health_hospital LIMIT 1;
    `);
    console.log('Sample:', JSON.stringify(maternal.rows[0], null, 2));

    // 8. Home Health, Hospice, Dialysis, etc.
    console.log('\n\n8. OTHER PROVIDER TYPES\n');
    const otherSchemas = await pool.query(`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema IN ('home_health', 'hospice', 'dialysis')
      ORDER BY table_schema;
    `);
    console.log('Schemas found:', otherSchemas.rows.map(r => r.table_schema));

    for (const {table_schema} of otherSchemas.rows) {
      const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 ORDER BY table_name LIMIT 3;
      `, [table_schema]);
      
      for (const {table_name} of tables.rows.slice(0, 1)) {
        const cols = await pool.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2;
        `, [table_schema, table_name]);
        
        const sample = await pool.query(`
          SELECT * FROM "${table_schema}"."${table_name}" LIMIT 1;
        `);
        
        console.log(`\n${table_schema}.${table_name}:`);
        console.log('  Columns:', cols.rows.map(c => c.column_name));
        console.log('  Sample:', JSON.stringify(sample.rows[0], null, 2));
      }
    }

    // 9. Check for Spending per Beneficiary and other datasets
    console.log('\n\n9. CHECKING FOR OTHER DATASETS\n');
    const allSchemas = await pool.query(`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'public')
      ORDER BY table_schema;
    `);
    console.log('All available schemas:');
    allSchemas.rows.forEach(r => console.log('  -', r.table_schema));

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    await pool.end();
    process.exit(1);
  }
}

assessDatasets();

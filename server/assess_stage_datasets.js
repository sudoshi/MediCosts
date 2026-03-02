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
    console.log('\n========== STAGE SCHEMA ASSESSMENT ==========\n');

    // List all tables in stage schema
    const allTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage'
      ORDER BY table_name;
    `);
    
    console.log(`TOTAL TABLES IN STAGE: ${allTables.rows.length}\n`);
    console.log('All tables:');
    allTables.rows.forEach(r => console.log('  -', r.table_name));

    // 1. NURSING HOMES
    console.log('\n\n========== 1. NURSING HOMES ==========\n');
    const nhTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%nursing%'
      ORDER BY table_name;
    `);
    console.log('Nursing home tables:', nhTables.rows.map(r => r.table_name));
    
    for (const {table_name} of nhTables.rows.slice(0, 3)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name).slice(0, 15));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        console.log('Sample row (first 5 fields):', Object.fromEntries(Object.entries(sample.rows[0]).slice(0, 5)));
      }
      
      const count = await pool.query(`SELECT COUNT(*) FROM stage."${table_name}";`);
      console.log('Row count:', count.rows[0].count);
    }

    // 2. DOCTORS & CLINICIANS - Physician Office Visits
    console.log('\n\n========== 2. DOCTORS & CLINICIANS (Physician Office Visits) ==========\n');
    const docTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%physician%'
      ORDER BY table_name;
    `);
    console.log('Physician tables:', docTables.rows.map(r => r.table_name));
    
    for (const {table_name} of docTables.rows.slice(0, 3)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        console.log('Sample:', JSON.stringify(sample.rows[0], null, 2).substring(0, 500));
      }
    }

    // 3. HOME HEALTH
    console.log('\n\n========== 3. HOME HEALTH ==========\n');
    const hhTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%home_health%'
      ORDER BY table_name LIMIT 5;
    `);
    console.log('Home health tables:', hhTables.rows.map(r => r.table_name));
    
    for (const {table_name} of hhTables.rows.slice(0, 2)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position LIMIT 15;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const sampleObj = sample.rows[0];
        const displayed = Object.keys(sampleObj).slice(0, 5).reduce((acc, k) => {
          acc[k] = sampleObj[k];
          return acc;
        }, {});
        console.log('Sample (first 5 fields):', displayed);
      }
    }

    // 4. HOSPICE
    console.log('\n\n========== 4. HOSPICE ==========\n');
    const hospTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%hospice%'
      ORDER BY table_name LIMIT 5;
    `);
    console.log('Hospice tables:', hospTables.rows.map(r => r.table_name));
    
    if (hospTables.rows.length > 0) {
      const {table_name} = hospTables.rows[0];
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position LIMIT 15;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const sampleObj = sample.rows[0];
        const displayed = Object.keys(sampleObj).slice(0, 5).reduce((acc, k) => {
          acc[k] = sampleObj[k];
          return acc;
        }, {});
        console.log('Sample:', displayed);
      }
    }

    // 5. DIALYSIS
    console.log('\n\n========== 5. DIALYSIS ==========\n');
    const dialTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%dialysis%'
      ORDER BY table_name LIMIT 5;
    `);
    console.log('Dialysis tables:', dialTables.rows.map(r => r.table_name));
    
    if (dialTables.rows.length > 0) {
      const {table_name} = dialTables.rows[0];
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position LIMIT 15;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
    }

    // 6. HOSPITAL VBP
    console.log('\n\n========== 6. HOSPITALS VALUE-BASED PURCHASING ==========\n');
    const vbpTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%value_based%'
      ORDER BY table_name;
    `);
    console.log('VBP tables:', vbpTables.rows.map(r => r.table_name));
    
    for (const {table_name} of vbpTables.rows.slice(0, 5)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position LIMIT 10;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const keys = Object.keys(sample.rows[0]);
        const displayed = keys.slice(0, 5).reduce((acc, k) => {
          acc[k] = sample.rows[0][k];
          return acc;
        }, {});
        console.log('Sample:', displayed);
      }
    }

    // 7. HOSPITAL SPENDING BY CLAIM
    console.log('\n\n========== 7. HOSPITAL SPENDING BY CLAIM ==========\n');
    const spendTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%spending%claim%'
      ORDER BY table_name;
    `);
    console.log('Spending by claim tables:', spendTables.rows.map(r => r.table_name));
    
    for (const {table_name} of spendTables.rows.slice(0, 3)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const keys = Object.keys(sample.rows[0]);
        const displayed = keys.slice(0, 5).reduce((acc, k) => {
          acc[k] = sample.rows[0][k];
          return acc;
        }, {});
        console.log('Sample:', displayed);
      }
    }

    // 8. UNPLANNED VISITS
    console.log('\n\n========== 8. UNPLANNED HOSPITAL VISITS ==========\n');
    const unplannedTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%unplanned%'
      ORDER BY table_name;
    `);
    console.log('Unplanned tables:', unplannedTables.rows.map(r => r.table_name));
    
    for (const {table_name} of unplannedTables.rows.slice(0, 2)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const distinctMeasures = await pool.query(`
        SELECT DISTINCT measure_id FROM stage."${table_name}" LIMIT 10;
      `);
      console.log('Sample measure IDs:', distinctMeasures.rows.map(r => r.measure_id));
    }

    // 9. MATERNAL HEALTH
    console.log('\n\n========== 9. MATERNAL HEALTH ==========\n');
    const maternalTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%maternal%'
      ORDER BY table_name;
    `);
    console.log('Maternal tables:', maternalTables.rows.map(r => r.table_name));
    
    for (const {table_name} of maternalTables.rows.slice(0, 2)) {
      console.log(`\n--- ${table_name} ---`);
      const cols = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'stage' AND table_name = $1 ORDER BY ordinal_position;
      `, [table_name]);
      console.log('Columns:', cols.rows.map(c => c.column_name));
      
      const sample = await pool.query(`SELECT * FROM stage."${table_name}" LIMIT 1;`);
      if (sample.rows.length > 0) {
        const keys = Object.keys(sample.rows[0]);
        const displayed = keys.reduce((acc, k) => {
          acc[k] = sample.rows[0][k];
          return acc;
        }, {});
        console.log('Sample:', JSON.stringify(displayed, null, 2).substring(0, 400));
      }
    }

    // 10. SPENDING PER BENEFICIARY
    console.log('\n\n========== 10. SPENDING PER BENEFICIARY ==========\n');
    const spbTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'stage' AND table_name LIKE '%spending_per%'
      ORDER BY table_name;
    `);
    console.log('SPB tables:', spbTables.rows.map(r => r.table_name));

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
    await pool.end();
    process.exit(1);
  }
}

assessDatasets();

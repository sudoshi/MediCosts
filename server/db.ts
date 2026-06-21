import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { projectRoot } from './lib/projectRoot.js';

dotenv.config({ path: path.join(projectRoot(), '.env') });

// Ensure password is always a string (pg fails if undefined)
const config: pg.PoolConfig = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD ?? '',
  database: process.env.PGDATABASE,
};

const pool = new pg.Pool(config);

export default pool;

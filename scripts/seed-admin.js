#!/usr/bin/env node
/**
 * seed-admin.js — Creates the initial admin user.
 *
 * Usage (from project root):
 *   cd scripts && node seed-admin.js
 *
 * You will be prompted for email and password interactively.
 */

import readline from 'readline';
import bcrypt from 'bcrypt';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD ?? '',
  database: process.env.PGDATABASE,
});

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function promptPassword(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    // Turn off echo for password
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function handler(ch) {
      ch = ch + '';
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (ch === '\u0003') {
        process.exit();
      } else {
        input += ch;
        process.stdout.write('*');
      }
    });
    process.stdin.resume();
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n── MediCosts Admin Seed ──\n');

  const email = (await prompt(rl, 'Admin email: ')).trim().toLowerCase();
  const fullName = (await prompt(rl, 'Full name:   ')).trim();
  rl.close();

  const password = await promptPassword('Password:    ');
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await pool.query(
      `INSERT INTO users (email, full_name, password_hash, must_change_password, role)
       VALUES ($1, $2, $3, false, 'admin')
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name = EXCLUDED.full_name,
             role = 'admin',
             must_change_password = false`,
      [email, fullName, hash]
    );
    console.log(`\n✓ Admin user "${email}" created/updated successfully.\n`);
  } catch (err) {
    console.error('Database error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

import { readFileSync } from 'fs';
import { Pool } from 'pg';

// Parse .env manually from cwd
const envText = readFileSync('./.env', 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  env[key] = val;
}
const DATABASE_URL = env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT tc.constraint_name, tc.table_name, tc.constraint_type, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name ILIKE '%attendance%'
    `);
    console.log('All constraints on attendance tables:');
    console.log(JSON.stringify(res.rows, null, 2));

    const res2 = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name ILIKE '%attendance%'
    `);
    console.log('Attendance tables:', res2.rows.map(r => r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
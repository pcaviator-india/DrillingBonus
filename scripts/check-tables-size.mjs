import { Pool } from 'pg';
import { readFileSync } from 'fs';

// Parse .env manually
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
    // Check exact table names
    const tablesRes = await client.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('All tables:');
    for (const t of tablesRes.rows) {
      console.log(`  ${t.table_name} (${t.table_schema})`);
    }

    // Try to get table size
    const sizeRes = await client.query(`
      SELECT relname as table_name, reltuples::bigint as estimate_rows
      FROM pg_class
      WHERE relname LIKE '%Attendance%'
      ORDER BY relname
    `);
    console.log('\nAttendance-related tables:');
    console.log(JSON.stringify(sizeRes.rows, null, 2));

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});

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
    // Get column names for AttendanceRecord
    const colsRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'AttendanceRecord'
      ORDER BY ordinal_position
    `);
    console.log('Columns in AttendanceRecord:');
    console.log(JSON.stringify(colsRes.rows, null, 2));

    // Check for duplicate (employeeId, date) pairs with quoted cols
    const dupCheck = await client.query(`
      SELECT "employeeId", "date", COUNT(*) as cnt
      FROM "AttendanceRecord"
      GROUP BY "employeeId", "date"
      HAVING COUNT(*) > 1
      ORDER BY "employeeId", "date"
      LIMIT 20
    `);
    console.log('\nDuplicate (employeeId, date) rows:', dupCheck.rows.length);
    if (dupCheck.rows.length > 0) {
      console.log(JSON.stringify(dupCheck.rows, null, 2));
    }

    // Total count
    const countRes = await client.query(`SELECT COUNT(*) as total FROM "AttendanceRecord"`);
    console.log('\nTotal AttendanceRecord rows:', countRes.rows[0].total);

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

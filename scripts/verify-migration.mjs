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
    // Check AttendanceMark table
    const marksCount = await client.query(`SELECT COUNT(*) as total FROM "AttendanceMark"`);
    console.log('AttendanceMark rows:', marksCount.rows[0].total);

    // Check distinct shifts in AttendanceRecord
    const shiftsRes = await client.query(`SELECT DISTINCT shift FROM "AttendanceRecord" ORDER BY shift`);
    console.log('\nDistinct shifts in AttendanceRecord:', JSON.stringify(shiftsRes.rows));

    // Check rows with NULL attendanceMarkId
    const nullMarkCheck = await client.query(`SELECT COUNT(*) as cnt FROM "AttendanceRecord" WHERE attendanceMarkId IS NULL`);
    console.log('\nRows with NULL attendanceMarkId:', nullMarkCheck.rows[0].cnt);

    // Check distinct values in attendanceMarkId column
    const markIdCheck = await client.query(`SELECT COUNT(DISTINCT attendanceMarkId) as distinct, COUNT(attendanceMarkId) as total FROM "AttendanceRecord"`);
    console.log('\nattendanceMarkId column stats:', JSON.stringify(markIdCheck.rows[0]));

    // Check Employee table has attendanceMarks column
    const colsRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Employee'
      ORDER BY ordinal_position
    `);
    console.log('\nEmployee columns (last 5):');
    for (let i = colsRes.rows.length - 5; i < colsRes.rows.length; i++) {
      console.log(`  ${colsRes.rows[i].column_name}: ${colsRes.rows[i].data_type}`);
    }

    // Sample AttendanceMark rows
    const sampleMarks = await client.query(`SELECT * FROM "AttendanceMark" LIMIT 3`);
    console.log('\nSample AttendanceMark rows:');
    console.log(JSON.stringify(sampleMarks.rows, null, 2));

    // Check total rows in AttendanceRecord still
    const totalCheck = await client.query(`SELECT COUNT(*) as total FROM "AttendanceRecord"`);
    console.log('\nTotal AttendanceRecord rows:', totalCheck.rows[0].total);

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

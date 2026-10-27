/**
 * Manual SQL migration for AttendanceRecord grain change
 * Changes: (employeeId, date) -> (employeeId, date, shift)
 * Also: adds AttendanceMark table, attendanceMarkId column, attendanceMarks relation
 * 
 * IMPORTANT: This migration must be run on a database with no other active changes.
 * BACKUP YOUR DATABASE BEFORE RUNNING!
 */

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

// SQL Statements to execute
const statements = [
  // Step 1: Create AttendanceMark table
  `CREATE TABLE "AttendanceMark" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employeeId    TEXT NOT NULL,
    punchDateTime TIMESTAMP NOT NULL,
    type          TEXT NOT NULL,
    shift         TEXT,
    origin        TEXT,
    device        TEXT,
    address       TEXT,
    coordinates   TEXT,
    isMobile      BOOLEAN,
    source        TEXT DEFAULT 'workera',
    sourceRef     TEXT,
    rawData       JSONB,
    createdAt     TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT "AttendanceMark_employeeId_sourceRef_key" UNIQUE (employeeId, sourceRef)
  )`,

  // Step 1b: Create indexes for AttendanceMark
  `CREATE INDEX "AttendanceMark_employeeId_punchDateTime_index" ON "AttendanceMark" (employeeId, punchDateTime)`,
  `CREATE INDEX "AttendanceMark_punchDateTime_index" ON "AttendanceMark" (punchDateTime)`,
  `CREATE INDEX "AttendanceMark_sourceRef_index" ON "AttendanceMark" (sourceRef)`,

  // Step 2: Add attendanceMarkId column to AttendanceRecord
  `ALTER TABLE "AttendanceRecord" ADD COLUMN attendanceMarkId UUID`,

  // Step 3: Drop old unique index AttendanceRecord_employeeId_date_key
  // (This was a unique index, not a named constraint)
  `DROP INDEX "AttendanceRecord_employeeId_date_key"`,

  // Step 4: Create new unique index on (employeeId, date, shift)
  `CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_shift_key" ON "AttendanceRecord" ("employeeId", "date", "shift")`,

  // Step 5: Add foreign key constraint for attendanceMarkId
  `ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_attendanceMarkId_fkey" FOREIGN KEY (attendanceMarkId) REFERENCES "AttendanceMark"("id") ON DELETE SET NULL`,

  // Step 6: Add attendanceMarks relation to Employee
  `ALTER TABLE "Employee" ADD COLUMN attendanceMarks JSONB`,

  // Step 7: Add foreign key for employeeId in AttendanceMark
  `ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_employeeId_fkey" FOREIGN KEY (employeeId) REFERENCES "Employee"("id") ON DELETE CASCADE`,

  // Comments for documentation
  `COMMENT ON TABLE "AttendanceMark" IS 'Raw Workera punch data, immutable after insertion'`,
  `COMMENT ON TABLE "AttendanceRecord" IS 'Aggregated per (employee, date, shift)'`,
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const stmt of statements) {
      await client.query(stmt);
      console.log('Executed:', stmt.substring(0, 120) + '...');
    }

    await client.query('COMMIT');
    console.log('Migration completed successfully!');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});

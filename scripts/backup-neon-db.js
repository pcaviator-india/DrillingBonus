/**
 * Neon DB Backup Script
 * Connects to the Neon PostgreSQL database and dumps schema + data
 * to a dated SQL backup file.
 *
 * Usage: node scripts/backup-neon-db.js
 * Output: backups/neon-backup-YYYY-MM-DD.sql
 */

import { Pool } from "pg";
import fs from "fs";
import path from "path";

// Read DATABASE_URL from .env manually (avoids dotenv ESM interop issues)
const envPath = path.resolve(".env");
const envText = fs.readFileSync(envPath, "utf8");
const envMatch = envText.match(/^DATABASE_URL=(.*)$/m);
const DATABASE_URL = envMatch ? envMatch[1].replace(/^"|"$/g, "") : null;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.");
  process.exit(1);
}

const BACKUP_DIR = path.resolve("backups");
const today = new Date();
const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
const backupFile = path.join(BACKUP_DIR, `neon-backup-${dateStr}.sql`);

async function main() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log(`Connected to Neon database. Starting backup to ${backupFile}...`);

    // Get all tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map((r) => r.table_name);

    const lines = [];
    lines.push(`-- Neon Database Backup`);
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push(`-- Database: ${DATABASE_URL.split("@")[1]?.split("/")[0] ?? "unknown"}`);
    lines.push(`-- Tables: ${tables.length}`);
    lines.push("");

    for (const table of tables) {
      console.log(`Dumping table: ${table}`);

      // Get column info for CREATE TABLE
      const colsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      // Build CREATE TABLE
      lines.push(`-- Table: ${table}`);
      lines.push(`DROP TABLE IF EXISTS public."${table}" CASCADE;`);
      lines.push(`CREATE TABLE public."${table}" (`);
      const colDefs = colsRes.rows.map((c) => {
        const nullable = c.is_nullable === "YES" ? "" : " NOT NULL";
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
        return `  "${c.column_name}" ${c.data_type}${def}${nullable}`;
      });
      lines.push(colDefs.join(",\n"));
      lines.push(");");
      lines.push("");

      // Get data
      const dataRes = await client.query(`SELECT * FROM public."${table}";`);
      if (dataRes.rows.length > 0) {
        const cols = Object.keys(dataRes.rows[0]);
        lines.push(`-- Data for ${table} (${dataRes.rows.length} rows)`);
        for (const row of dataRes.rows) {
          const values = cols.map((col) => {
            const val = row[col];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "object" && !Buffer.isBuffer(val)) {
              return `'${String(JSON.stringify(val)).replace(/'/g, "''")}'`;
            }
            if (typeof val === "string") {
              return `'${val.replace(/'/g, "''")}'`;
            }
            return String(val);
          });
          lines.push(`INSERT INTO public."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")});`);
        }
        lines.push("");
      }
    }

    fs.writeFileSync(backupFile, lines.join("\n") + "\n", "utf8");
    console.log(`Backup complete: ${backupFile}`);
    console.log(`Tables dumped: ${tables.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
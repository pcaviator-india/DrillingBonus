// Re-uploads every var in .env to Vercel (production) byte-for-byte.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const raw = readFileSync(".env", "utf8");
const vars = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

for (const [key, value] of Object.entries(vars)) {
  if (!value) continue;
  if (key === "AUTH_URL") continue; // set separately to the production URL
  spawnSync("vercel", ["env", "rm", key, "production", "--yes"], {
    shell: true,
    stdio: "ignore",
  });
  const res = spawnSync("vercel", ["env", "add", key, "production"], {
    shell: true,
    input: value,
    encoding: "utf8",
  });
  const ok = res.status === 0;
  console.log(`${ok ? "OK " : "FAIL"} ${key}${ok ? "" : " -> " + res.stderr}`);
}

// AUTH_URL must point at the production deployment
spawnSync("vercel", ["env", "rm", "AUTH_URL", "production", "--yes"], { shell: true, stdio: "ignore" });
const r2 = spawnSync("vercel", ["env", "add", "AUTH_URL", "production"], {
  shell: true,
  input: "https://drillingbonus.vercel.app",
  encoding: "utf8",
});
console.log(`${r2.status === 0 ? "OK " : "FAIL"} AUTH_URL (production URL)`);


/**
 * Auth-transport probe for Workera. Run: npx tsx --env-file=.env scripts/probe-auth.ts
 */
const BASE = (process.env.WORKERA_BASE_URL ?? "").replace(/\/+$/, "");
const KEY = process.env.WORKERA_API_KEY ?? "";
const USER = process.env.WORKERA_API_USER ?? "";

async function t(label: string, url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    const body = await res.text();
    console.log(`[${label}] ${res.status} — ${body.slice(0, 160).replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`[${label}] EXC ${(e as Error).message}`);
  }
}

async function main() {
  const path = "/branchOffice?page=1";
  await t("key-only-query", `${BASE}${path}&API_KEY=${KEY}`, {});
  await t("key-only-header", `${BASE}${path}`, { API_KEY: KEY });
  await t("api-key-header", `${BASE}${path}`, { "x-api-key": KEY });
  await t("bearer", `${BASE}${path}`, { Authorization: `Bearer ${KEY}` });
  await t("both-query-userempty", `${BASE}${path}&API_USER=&API_KEY=${KEY}`, {});
  if (USER) {
    await t("both-query", `${BASE}${path}&API_USER=${USER}&API_KEY=${KEY}`, {});
    await t("both-headers", `${BASE}${path}`, { API_USER: USER, API_KEY: KEY });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

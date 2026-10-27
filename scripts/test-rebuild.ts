import { rebuildWorkDays } from "../src/lib/matching";

async function main() {
  const r = await rebuildWorkDays("2026-08-01", "2026-08-31");
  console.log(JSON.stringify(r));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
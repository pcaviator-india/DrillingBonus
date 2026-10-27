import { db } from "../src/lib/db";
async function main() {
  const ca = await db.crewAssignment.findMany({ where: { employeeId: "cmthqiarl001on0b4s66lct11" }, include: { rig: true } });
  console.log("crewAssignment:", ca.length);
  for (const c of ca.slice(0,25)) console.log(c.date.toISOString().slice(0,10), c.rig?.name, "rigSite="+c.rig?.siteId, "shift="+c.shift, "role="+c.roleOnShift);
  const rigs = await db.rig.findMany({ where: { id: "cmv6vroby000vn0085ui5j59k" } });
  console.log("rig:", JSON.stringify(rigs, null, 2));
  await db.$disconnect();
}
main();

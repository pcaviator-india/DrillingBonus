import { db } from "../src/lib/db";
async function main() {
  const lines = await db.bonusCalculationLine.findMany({ where: { calculationId: "cmvi9twif00cmn098ffta0nu0" }, select: { employeeId:true, roleUsed:true, totalMeters:true, calculatedBonus:true, breakdown:true } });
  const emps = await db.employee.findMany({ where: { id: { in: lines.map(l=>l.employeeId) } }, select: { id:true, fullName:true } });
  const name = new Map(emps.map(e=>[e.id,e.fullName]));
  const withMeters = lines.filter(l=>l.totalMeters>0);
  console.log("total lines:", lines.length, "| lines with meters>0:", withMeters.length);
  for (const l of lines) console.log(`${name.get(l.employeeId)} | ${l.roleUsed} | meters=${l.totalMeters} | bonus=${l.calculatedBonus} | comps=${(l.breakdown as any).components?.map((c:any)=>c.bonusTypeCode).join(",")}`);
  await db.$disconnect();
}
main();

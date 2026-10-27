import { db } from "../src/lib/db";
async function main(){
  const emps = await db.employee.findMany({where:{fullName:{contains:"ARIEL ANDRES SILVA",mode:"insensitive"}},select:{id:true,fullName:true,rut:true,defaultRole:true,jobPositionName:true}});
  console.log(JSON.stringify(emps,null,2));
  for(const e of emps){
    const a=await db.crewAssignment.findMany({where:{employeeId:e.id},orderBy:{date:"asc"},include:{rig:true}});
    console.log("ASSIGN "+e.fullName+" count="+a.length);
    for(const x of a) console.log(x.date.toISOString().slice(0,10),x.shift,x.roleOnShift,x.rig.name);
  }
  const d=await db.dailyCrewEntry.findMany({where:{rutNormalized:{contains:"15613806"}},orderBy:{date:"asc"}});
  console.log("ENTRIES rut 15613806:",d.length);
  for(const x of d) console.log(x.date.toISOString().slice(0,10),x.shiftDayNight,x.cargoRaw,x.cargoNormalized,x.machine,x.fullName);
}
main().finally(()=>db.$disconnect());

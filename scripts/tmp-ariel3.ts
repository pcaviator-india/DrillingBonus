import { db } from "../src/lib/db";
async function main(){
  // assignments for Ariel conductor with rawData
  const emps = await db.employee.findMany({where:{fullName:{contains:"ARIEL ANDRES SILVA",mode:"insensitive"}}});
  for(const e of emps){
    const a=await db.crewAssignment.findMany({where:{employeeId:e.id, roleOnShift:"Conductor"},orderBy:{date:"asc"}});
    console.log("cond assigns",a.length);
    for(const x of a.slice(0,5)) console.log(JSON.stringify(x,null,2));
  }
  const sample=await db.dailyCrewEntry.findMany({take:3});
  console.log("sample entry",JSON.stringify(sample,null,2));
  const cond=await db.dailyCrewEntry.findMany({where:{cargoNormalized:"CONDUCTOR"},take:5,orderBy:{date:"asc"}});
  for(const x of cond) console.log(x.date.toISOString().slice(0,10),x.shiftDayNight,"|"+x.rut+"|"+x.rutNormalized+"|","|"+x.fullName+"|","|"+x.cargoRaw+"|",x.machine,x.uploadId);
  const ups=await db.excelUpload.findMany({orderBy:{uploadedAt:"desc"},take:10});
  for(const u of ups) console.log(u.fileName,u.kind,u.siteId,u.rowCount,u.uploadedAt.toISOString(),u.id);
}
main().finally(()=>db.$disconnect());

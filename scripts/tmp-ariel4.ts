import { db } from "../src/lib/db";
async function main(){
  const emps = await db.employee.findMany({where:{fullName:{contains:"ARIEL ANDRES SILVA",mode:"insensitive"}}});
  for(const e of emps){
    const a=await db.crewAssignment.findMany({where:{employeeId:e.id, roleOnShift:"Conductor"},orderBy:{date:"asc"}});
    for(const x of a){
      const eid=(x.rawData as any)?.dailyCrewEntryId;
      const entry=eid?await db.dailyCrewEntry.findUnique({where:{id:eid}}):null;
      console.log(x.date.toISOString().slice(0,10),x.shift,"entry:",entry?JSON.stringify({rut:entry.rut,rutN:entry.rutNormalized,fullName:entry.fullName,cargoRaw:entry.cargoRaw,cargoN:entry.cargoNormalized,machine:entry.machine,sheet:entry.sheetName,upload:entry.uploadId,date:entry.date.toISOString().slice(0,10)}):"MISSING");
    }
  }
  const ups=await db.excelUpload.findMany({orderBy:{uploadedAt:"desc"},take:15});
  for(const u of ups) console.log("UPLOAD",u.fileName,"|",u.kind,"| site=",u.siteId,"| rows=",u.rowCount,"|",u.uploadedAt.toISOString(),"|",u.id);
}
main().finally(()=>db.$disconnect());

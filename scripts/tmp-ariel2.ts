import { db } from "../src/lib/db";
async function main(){
  const d=await db.dailyCrewEntry.findMany({where:{fullName:{contains:"ARIEL",mode:"insensitive"}},orderBy:{date:"asc"}});
  console.log("entries name ARIEL:",d.length);
  for(const x of d) console.log(x.date.toISOString().slice(0,10),x.shiftDayNight,"|"+x.rut+"|"+x.rutNormalized+"|","|"+x.fullName+"|","|"+x.cargoRaw+"|","|"+x.cargoNormalized+"|",x.machine,x.uploadId);
  const d2=await db.dailyCrewEntry.findMany({where:{cargoNormalized:{contains:"CONDUCTOR",mode:"insensitive"}}});
  console.log("conductor entries:",d2.length);
}
main().finally(()=>db.$disconnect());

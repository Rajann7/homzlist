/**
 * Seed a minimal Gujarat location tree for dev (Doc2 §5.1 cascade).
 * Real master data is admin-managed (Module 11); this just makes the form usable.
 */
import fs from "node:fs"; import path from "node:path"; import pg from "pg";
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)),"..");
const env={}; for(const l of fs.readFileSync(path.join(ROOT,".env.local"),"utf8").split(/\r?\n/)){const m=/^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const c=new pg.Client({host:`db.${env.SUPABASE_PROJECT_REF}.supabase.co`,port:5432,user:"postgres",password:env.SUPABASE_DB_PASSWORD,database:"postgres",ssl:{rejectUnauthorized:false}});
await c.connect();
const ins=async(parent,level,name)=>{
  const ex=await c.query("select id from locations where level=$1 and name=$2 and parent_id is not distinct from $3",[level,name,parent]);
  if(ex.rows[0])return ex.rows[0].id;
  const r=await c.query("insert into locations (parent_id,level,name) values ($1,$2,$3) returning id",[parent,level,name]);
  return r.rows[0].id;
};
const gj=await ins(null,"state","Gujarat");
const dist=await ins(gj,"district","Rajkot");
const tal=await ins(dist,"taluka","Rajkot");
const city=await ins(tal,"city","Rajkot");
for(const a of ["Mavdi","Raiya Road","University Road","Kalawad Road","150 Feet Ring Road","Kuvadva Road"]) await ins(city,"area",a);
const r=await c.query("select level,count(*)::int n from locations group by level order by 1");
console.log(r.rows);
await c.end();

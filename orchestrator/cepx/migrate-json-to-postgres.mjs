import {createHash} from "node:crypto";
import {copyFile,readFile,stat} from "node:fs/promises";
import {basename,resolve} from "node:path";
import {CEPXPostgresStore} from "./postgres-store.mjs";

const stableStringify=value=>JSON.stringify(value,(key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const sha256=value=>createHash("sha256").update(value).digest("hex");
const countProjects=state=>Object.keys(state.projects).length;
const countTasks=state=>Object.values(state.projects).reduce((n,p)=>n+(Array.isArray(p.tasks)?p.tasks.length:0),0);
const validateState=state=>{
 if(!state||state.schema!==1||!state.projects||typeof state.projects!=="object"||Array.isArray(state.projects))throw Error("CEPX_JSON_STATE_INVALID");
 for(const [id,p] of Object.entries(state.projects)){
  if(!p||typeof p!=="object"||p.id!==id||!Array.isArray(p.tasks)||!Array.isArray(p.checkpoints??[]))throw Error("CEPX_JSON_PROJECT_INVALID:"+id);
  const ids=new Set();
  for(const task of p.tasks){if(!task||typeof task.id!=="string"||!task.id||ids.has(task.id))throw Error("CEPX_JSON_TASK_INVALID:"+id);ids.add(task.id);}
 }
 return state;
};

/**
 * Safe, non-destructive JSON -> PostgreSQL migration.
 * Preview is the default. Applying requires apply:true and an empty/equivalent target.
 * The source file is never modified or deleted.
 */
export async function migrateJsonToPostgres({file,store,backupPath,apply=false}={}){
 if(!file||!store)throw Error("CEPX_MIGRATION_FILE_AND_STORE_REQUIRED");
 const sourcePath=resolve(file),sourceStat=await stat(sourcePath);
 if(!sourceStat.isFile())throw Error("CEPX_MIGRATION_SOURCE_NOT_FILE");
 const sourceBytes=await readFile(sourcePath);
 const sourceText=sourceBytes.toString("utf8");
 let parsed;try{parsed=JSON.parse(sourceText);}catch{throw Error("CEPX_MIGRATION_JSON_PARSE_FAILED");}
 const state=validateState(parsed),sourceChecksum=sha256(stableStringify(state));
 const before=await store.read();
 const beforeChecksum=sha256(stableStringify(before));
 const targetEmpty=Object.keys(before.projects).length===0;
 const alreadyMigrated=beforeChecksum===sourceChecksum;
 if(!targetEmpty&&!alreadyMigrated)throw Error("CEPX_MIGRATION_TARGET_NOT_EMPTY_OR_EQUIVALENT");
 const preview={source:sourcePath,sourceBytes:sourceBytes.length,sourceChecksum,namespace:store.namespace,projects:countProjects(state),tasks:countTasks(state),targetEmpty,alreadyMigrated,applied:false};
 if(!apply)return preview;
 if(alreadyMigrated)return {...preview,applied:true,alreadyMigrated:true,verified:true};
 if(!targetEmpty)throw Error("CEPX_MIGRATION_TARGET_CHANGED");
 const backup=resolve(backupPath??(sourcePath+".pre-postgres-backup"));
 // Exclusive creation prevents overwriting a prior recovery copy.
 await copyFile(sourcePath,backup,1);
 const backupBytes=await readFile(backup);
 if(sha256(backupBytes)!==sha256(sourceBytes))throw Error("CEPX_MIGRATION_BACKUP_CHECKSUM_MISMATCH");
 try{
  await store.transaction(current=>{
   if(Object.keys(current.projects).length!==0)throw Error("CEPX_MIGRATION_TARGET_CHANGED");
   current.schema=state.schema;
   current.projects=structuredClone(state.projects);
   return true;
  });
  const after=await store.read(),targetChecksum=sha256(stableStringify(after));
  if(targetChecksum!==sourceChecksum)throw Error("CEPX_MIGRATION_POST_WRITE_VERIFICATION_FAILED");
  // Detect source edits during the migration; retain destination but fail loudly for operator review.
  const sourceAfter=await readFile(sourcePath);
  if(sha256(sourceAfter)!==sha256(sourceBytes))throw Error("CEPX_MIGRATION_SOURCE_CHANGED_DURING_RUN");
  return {...preview,backup,backupChecksum:sha256(backupBytes),applied:true,verified:true,targetChecksum};
 }catch(error){
  // Never delete the backup or mutate the source. An operator can safely rerun after inspecting target state.
  throw error;
 }
}

async function main(argv){
 const args=new Map();
 for(let i=0;i<argv.length;i++){
  const token=argv[i];
  if(token==="--apply"){args.set("apply",true);continue;}
  if(!token.startsWith("--"))throw Error("CEPX_MIGRATION_UNKNOWN_ARGUMENT:"+token);
  const key=token.slice(2),value=argv[i+1];
  if(!value||value.startsWith("--"))throw Error("CEPX_MIGRATION_ARGUMENT_VALUE_REQUIRED:"+token);
  args.set(key,value);i++;
 }
 const file=args.get("file"),databaseUrl=args.get("database-url")??process.env.CEPX_DATABASE_URL??process.env.CEPX_TEST_DATABASE_URL;
 if(!file||!databaseUrl)throw Error("Usage: node orchestrator/cepx/migrate-json-to-postgres.mjs --file <path> [--database-url <url>] [--namespace <name>] [--backup <path>] [--apply]");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:databaseUrl,max:2});
 const store=new CEPXPostgresStore({pool,namespace:args.get("namespace")??"default"});
 try{
  await store.migrate();
  const result=await migrateJsonToPostgres({file,store,backupPath:args.get("backup"),apply:args.get("apply")===true});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
 }finally{await pool.end();}
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 main(process.argv.slice(2)).catch(error=>{process.stderr.write(String(error.message??error)+"\n");process.exitCode=1;});
}

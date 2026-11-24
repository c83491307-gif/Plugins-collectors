import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Pool} from "pg";
import {createRuntime,createRuntimeAsync} from "../runtime.mjs";
import {CEPX} from "../cepx/index.mjs";
import {CEPXPostgresStore} from "../cepx/postgres-store.mjs";
import {migrateJsonToPostgres} from "../cepx/migrate-json-to-postgres.mjs";

const databaseUrl=process.env.CEPX_TEST_DATABASE_URL;
if(!databaseUrl){
 console.log("CEPX PostgreSQL integration tests SKIP: CEPX_TEST_DATABASE_URL is not set");
} else {
 const namespace="cepx-test-"+process.pid+"-"+Date.now();
 const poolA=new Pool({connectionString:databaseUrl,max:8});
 const poolB=new Pool({connectionString:databaseUrl,max:8});
 const runtimeA=createRuntime({cepx:{backend:"postgres",pool:poolA,namespace}});
 const runtimeB=createRuntime({cepx:{backend:"postgres",pool:poolB,namespace}});
 const isolated=createRuntime({cepx:{backend:"postgres",pool:poolA,namespace:namespace+"-isolated"}});
 const jsonDir=await mkdtemp(join(tmpdir(),"cepx-json-preserve-"));
 try{
  await runtimeA.cepx.ready();await runtimeA.cepx.ready();
  await runtimeA.cepx.ensureProject("postgres-project",{name:"PostgreSQL"});
  const writes=await Promise.all([
   ...Array.from({length:30},(_,i)=>(i%2?runtimeA.cepx:runtimeB.cepx).enqueue("postgres-project",{title:"concurrent-"+i})),
   ...Array.from({length:20},(_,i)=>(i%2?runtimeA.cepx:runtimeB.cepx).enqueue("postgres-project",{title:"one-global-duplicate"}))
  ]);
  assert.equal(writes.filter(x=>x.created).length,31,"concurrent PostgreSQL writes must serialize and deduplicate globally");
  assert.equal((await runtimeB.cepx.get("postgres-project")).tasks.length,31);
  // A failed domain mutation must roll back the whole SQL transaction.
  await assert.rejects(()=>runtimeA.cepx.enqueueMany("postgres-project",[{title:"must-rollback"},{title:""}]),/TASK_TITLE_REQUIRED/);
  assert.equal((await runtimeB.cepx.get("postgres-project")).tasks.length,31);
  const checkpoint=await runtimeA.cepx.checkpoint("postgres-project","postgres-transaction");
  assert.equal((await runtimeB.cepx.inspect("postgres-project"))[0].valid,true);
  await runtimeB.cepx.updateProject("postgres-project",{goal:"changed"});
  await runtimeA.cepx.restore("postgres-project",checkpoint.id);
  assert.equal((await runtimeB.cepx.get("postgres-project")).goal,"");
  await isolated.cepx.ensureProject("postgres-project",{name:"Isolated"});
  assert.equal((await isolated.cepx.get("postgres-project")).tasks.length,0,"namespace isolation");
  const asyncRuntime=await createRuntimeAsync({cepx:{backend:"postgres",databaseUrl,namespace:namespace+"-factory"}});
  await asyncRuntime.cepx.ensureProject("async-factory",{name:"Async runtime"});
  assert.equal((await asyncRuntime.cepx.get("async-factory")).id,"async-factory");
  await asyncRuntime.close();
  const jsonFile=join(jsonDir,"legacy.json"),backupFile=join(jsonDir,"legacy.backup.json");
  const jsonEngine=new CEPX({file:jsonFile});
  await jsonEngine.ensureProject("json-still-works",{name:"JSON"});
  await jsonEngine.enqueue("json-still-works",{title:"preserve this task"});
  await jsonEngine.checkpoint("json-still-works","migration-fixture");
  const originalBytes=await readFile(jsonFile);
  const migrationStore=new CEPXPostgresStore({pool:poolA,namespace:namespace+"-migration"});
  const preview=await migrateJsonToPostgres({file:jsonFile,store:migrationStore,backupPath:backupFile});
  assert.equal(preview.applied,false,"preview must not write");
  assert.equal(preview.projects,1);
  assert.equal(preview.tasks,1);
  assert.equal((await migrationStore.read()).projects["json-still-works"],undefined,"preview leaves target untouched");
  const migrated=await migrateJsonToPostgres({file:jsonFile,store:migrationStore,backupPath:backupFile,apply:true});
  assert.equal(migrated.verified,true);
  assert.equal(migrated.sourceChecksum,migrated.targetChecksum,"source and target canonical checksums must match");
  assert.deepEqual(await readFile(backupFile),originalBytes,"backup must be byte-identical");
  assert.deepEqual(await readFile(jsonFile),originalBytes,"source JSON must remain byte-identical");
  const rerun=await migrateJsonToPostgres({file:jsonFile,store:migrationStore,backupPath:backupFile,apply:true});
  assert.equal(rerun.alreadyMigrated,true,"retries must be idempotent");
  const conflictingStore=new CEPXPostgresStore({pool:poolA,namespace:namespace+"-migration-conflict"});
  await conflictingStore.transaction(state=>{state.projects.keep={id:"keep",tasks:[],checkpoints:[]};});
  await assert.rejects(()=>migrateJsonToPostgres({file:jsonFile,store:conflictingStore,backupPath:join(jsonDir,"conflict.backup"),apply:true}),/CEPX_MIGRATION_TARGET_NOT_EMPTY_OR_EQUIVALENT/);
  assert.equal((await conflictingStore.read()).projects.keep.id,"keep","conflicting destination must not be overwritten");
  console.log("CEPX PostgreSQL tests PASS: migrations, checksum validation, namespace isolation, independent pools, 50 concurrent writes, global dedupe, transaction rollback, checkpoint restore, async runtime, JSON compatibility, migration preview/apply, byte-identical backup/source, checksum verification, idempotent retry and conflict refusal");
 } finally {
  await poolA.query("DELETE FROM cepx_state WHERE namespace = ANY($1::text[])",[[namespace,namespace+"-isolated",namespace+"-factory"]]).catch(()=>{});
  await Promise.all([poolA.end(),poolB.end()]);
  await rm(jsonDir,{recursive:true,force:true});
 }
}

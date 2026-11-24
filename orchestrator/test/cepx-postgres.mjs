import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Pool} from "pg";
import {createRuntime,createRuntimeAsync} from "../runtime.mjs";
import {CEPX} from "../cepx/index.mjs";

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
  const jsonEngine=new CEPX({file:join(jsonDir,"legacy.json")});
  await jsonEngine.ensureProject("json-still-works",{name:"JSON"});
  assert.equal((await jsonEngine.get("json-still-works")).name,"JSON");
  console.log("CEPX PostgreSQL tests PASS: migrations, checksum validation, namespace isolation, independent pools, 50 concurrent writes, global dedupe, transaction rollback, checkpoint restore, async runtime, JSON backend compatibility");
 } finally {
  await poolA.query("DELETE FROM cepx_state WHERE namespace = ANY($1::text[])",[[namespace,namespace+"-isolated",namespace+"-factory"]]).catch(()=>{});
  await Promise.all([poolA.end(),poolB.end()]);
  await rm(jsonDir,{recursive:true,force:true});
 }
}

import assert from "node:assert/strict";
import {mkdtemp,rm,writeFile,readFile,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CEPX} from "../cepx/index.mjs";

// CI exercises 10k tasks; opt in to 100k with CEPX_SCALE_TASKS=100000.
const count=Math.max(1000,Math.min(100000,Number(process.env.CEPX_SCALE_TASKS)||10000));
const dir=await mkdtemp(join(tmpdir(),"cepx-scale-")),file=join(dir,"state.json");
const before=process.memoryUsage().heapUsed;
try{
 const engine=new CEPX({file,lockTimeoutMs:60000,lockLeaseMs:15000,lockRetryMs:5});
 await engine.ensureProject("scale",{name:"CEPX scale and recovery"});
 // A crash-leftover temporary file must never be mistaken for committed state.
 await writeFile(file+".crash-leftover.tmp","{incomplete");
 const items=Array.from({length:count},(_,i)=>({title:"scale-task-"+i,description:"bounded payload "+(i%100)}));
 const started=performance.now();
 const created=await engine.enqueueMany("scale",items);
 const bulkMs=+(performance.now()-started).toFixed(2);
 assert.equal(created.length,count);
 assert.equal(created.filter(x=>x.created).length,count);
 const state=await engine.get("scale");
 assert.equal(state.tasks.length,count);
 assert.equal(new Set(state.tasks.map(x=>x.fingerprint)).size,count);
 const checkpoint=await engine.checkpoint("scale","scale-checkpoint");
 assert.ok(checkpoint.checksum);
 const bytes=(await stat(file)).size;
 // Restart simulates process recovery from the last atomically committed snapshot.
 const restarted=new CEPX({file,lockTimeoutMs:60000,lockLeaseMs:15000,lockRetryMs:5});
 assert.equal((await restarted.get("scale")).tasks.length,count);
 const inspected=await restarted.inspect("scale");
 assert.equal(inspected.length,1);
 assert.equal(inspected[0].valid,true);
 await restarted.updateProject("scale",{goal:"mutation after checkpoint"});
 const restored=await restarted.restore("scale",checkpoint.id);
 assert.equal(restored.goal,"");
 assert.equal(restored.tasks.length,count);
 const duplicate=await restarted.enqueueMany("scale",items);
 assert.equal(duplicate.filter(x=>x.created).length,0);
 const heapDelta=Math.max(0,process.memoryUsage().heapUsed-before);
 const result={node:process.version,tasks:count,bulkMs,bulkTasksPerSecond:+(count/(bulkMs/1000)).toFixed(1),stateBytes:bytes,heapDeltaBytes:heapDelta,checkpointValid:inspected[0].valid,restartTaskCount:(await restarted.get("scale")).tasks.length,duplicateCreated:duplicate.filter(x=>x.created).length};
 console.log("CEPX_SCALE_RESULT "+JSON.stringify(result));
 console.log("CEPX scale/restart/recovery tests PASS");
}finally{await rm(dir,{recursive:true,force:true});}

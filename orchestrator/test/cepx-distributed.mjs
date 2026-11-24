import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,utimes,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {CEPX} from "../cepx/index.mjs";
const dir=await mkdtemp(join(tmpdir(),"cepx-multiprocess-")),file=join(dir,"state.json");
function runWorker(id,count){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[new URL("./cepx-worker.mjs",import.meta.url).pathname,file,id,String(count)],{stdio:["ignore","pipe","pipe"]});let out="",err="";p.stdout.on("data",x=>out+=x);p.stderr.on("data",x=>err+=x);p.on("error",reject);p.on("close",code=>code===0?resolve(out):reject(Error("worker "+id+" exit "+code+": "+err)));});}
try{
 const workers=await Promise.all(Array.from({length:4},(_,i)=>runWorker(String(i),20)));
 assert.equal(workers.length,4);
 const c=new CEPX({file,lockTimeoutMs:30000,lockLeaseMs:5000});
 const p=await c.get("shared");assert.ok(p);assert.equal(p.tasks.length,81,"80 distinct tasks plus exactly one shared idempotent task");
 assert.equal(new Set(p.tasks.map(t=>t.fingerprint)).size,81,"no lost writes or duplicate fingerprints across processes");
 const checkpoint=await c.checkpoint("shared","multiprocess-test");assert.ok(checkpoint.id);
 const lock=file+".lock";await mkdir(lock);await writeFile(join(lock,"owner.json"),JSON.stringify({token:"dead-owner",pid:99999999,host:"dead-host",createdAt:0}));
 const past=new Date(Date.now()-5000);await utimes(lock,past,past);
 const recovered=new CEPX({file,lockTimeoutMs:3000,lockLeaseMs:100,lockRetryMs:5});
 const after=await recovered.enqueue("shared",{title:"after-stale-lock-recovery"});assert.equal(after.created,true);
 assert.equal((await recovered.get("shared")).tasks.length,82);
 console.log("CEPX distributed tests PASS: 4 OS processes, 80 concurrent unique writes, global idempotency, checkpoint, stale-lock recovery");
}finally{await rm(dir,{recursive:true,force:true});}

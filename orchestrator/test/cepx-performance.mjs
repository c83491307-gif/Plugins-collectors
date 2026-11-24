import assert from "node:assert/strict";
import {mkdtemp,rm,stat,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {performance,monitorEventLoopDelay} from "node:perf_hooks";
import {CEPX} from "../cepx/index.mjs";
const count=Math.max(40,Math.min(500,Number(process.env.CEPX_PERF_TASKS)||120));
const dir=await mkdtemp(join(tmpdir(),"cepx-perf-")),file=join(dir,"state.json");
const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))]??0;};
const sample=async(fn,n)=>{const values=[];for(let i=0;i<n;i++){const t=performance.now();await fn(i);values.push(performance.now()-t);}return {p50:+pct(values,.5).toFixed(2),p95:+pct(values,.95).toFixed(2),max:+Math.max(...values).toFixed(2)};};
try{
 const c=new CEPX({file,lockTimeoutMs:30000,lockLeaseMs:10000,lockRetryMs:5});
 let t=performance.now();await c.ensureProject("bench",{name:"CEPX performance benchmark"});const createProjectMs=+(performance.now()-t).toFixed(2);
 const enqueue=await sample(i=>c.enqueue("bench",{title:"benchmark-task-"+i,description:"bounded synthetic task payload ".repeat(3)}),count);
 const p=await c.get("bench");assert.equal(p.tasks.length,count);
 await c.ensureProject("bulk",{name:"CEPX bulk benchmark"});t=performance.now();const bulkResult=await c.enqueueMany("bulk",Array.from({length:count},(_,i)=>({title:"bulk-task-"+i,description:"bounded synthetic task payload ".repeat(3)})));const bulkEnqueueMs=+(performance.now()-t).toFixed(2);assert.equal(bulkResult.filter(x=>x.created).length,count);assert.equal((await c.get("bulk")).tasks.length,count);\n const read=await sample(()=>c.get("bench"),30);
 const list=await sample(()=>c.list(),30);
 const compression=await sample(i=>c.compress({project:"bench",goal:"benchmark",rules:["preserve state","avoid duplicate work"],decisions:Array.from({length:80},(_,n)=>"decision-"+n+"-"+i),blockers:["none"],nextActions:Array.from({length:80},(_,n)=>"action-"+n),completed:Array.from({length:80},(_,n)=>"completed-"+n)},{maxChars:6000}),30);
 t=performance.now();const cp=await c.checkpoint("bench","perf");const checkpointMs=+(performance.now()-t).toFixed(2);assert.ok(cp.id);
 const bytes=(await stat(file)).size;
 const state=JSON.parse(await readFile(file,"utf8"));assert.equal(state.projects.bench.tasks.length,count);
 const result={node:process.version,tasks:count,createProjectMs,enqueue,bulkEnqueueMs,bulkTasksPerSecond:+(count/(bulkEnqueueMs/1000)).toFixed(1),read,list,compression,checkpointMs,stateBytes:bytes,eventLoopDelayMs:{mean:+(histogram.mean/1e6).toFixed(2),p95:+(histogram.percentile(95)/1e6).toFixed(2),max:+(histogram.max/1e6).toFixed(2)},heapUsedBytes:process.memoryUsage().heapUsed};
 assert.ok(Number.isFinite(enqueue.p95)&&Number.isFinite(read.p95)&&Number.isFinite(compression.p95));
 assert.ok(enqueue.max<30000,"single enqueue latency exceeded 30s guardrail");
 console.log("CEPX_PERF_RESULT "+JSON.stringify(result));
 console.log("CEPX performance benchmark PASS");
}finally{histogram.disable();await rm(dir,{recursive:true,force:true});}

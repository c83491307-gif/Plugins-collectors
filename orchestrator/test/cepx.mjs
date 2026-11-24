import {strict as a} from "node:assert";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";import {join} from "node:path";
import {CEPX} from "../cepx/index.mjs";
const dir=await mkdtemp(join(tmpdir(),"cepx-"));try{
 const c=new CEPX({file:join(dir,"state.json")});await c.ensureProject("p",{name:"Project"});
 const dup=await Promise.all(Array.from({length:25},()=>c.enqueue("p",{title:"same task"})));a.equal(dup.filter(x=>x.created).length,1);
 const many=await Promise.all(Array.from({length:25},(_,i)=>c.enqueue("p",{title:"task "+i})));a.equal(many.filter(x=>x.created).length,25);
 const bulk=await c.enqueueMany("p",[{title:"bulk-a"},{title:"bulk-b"},{title:"bulk-a"}]);a.equal(bulk.filter(x=>x.created).length,2);a.equal(bulk.filter(x=>!x.created).length,1);
 const first=dup[0].task;await c.transition("p",first.id,"running");await c.transition("p",first.id,"completed");
 const cp=await c.checkpoint("p","before-change");await c.updateProject("p",{goal:"changed"});await c.restore("p",cp.id);a.equal((await c.get("p")).goal,"");
 const compressed=c.compress({project:"p",goal:"g",rules:["r"],activeTask:"task",blockers:["none"],completed:["done"]},{maxChars:256});a.ok(compressed.chars<=256);a.ok(compressed.checksum);
 c.registerTool({id:"bad",priority:1,run:async()=>{throw Object.assign(Error("rate"),{code:"429"});}});c.registerTool({id:"good",priority:2,run:async()=>42});const result=await c.execute({});a.equal(result.result,42);a.equal(result.provider,"good");
 const handoff=await c.handoff("p");a.ok(handoff.summary);console.log("CEPX tests PASS: persistence, concurrent dedupe, ledger, checkpoints, compression, fallback, handoff");
}finally{await rm(dir,{recursive:true,force:true});}

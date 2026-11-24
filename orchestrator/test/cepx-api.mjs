import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createRuntime} from "../runtime.mjs";
import {startServer} from "../api/openai-compatible-server.mjs";
const dir=await mkdtemp(join(tmpdir(),"cepx-api-"));
const prior=process.env.CEPX_API_TOKEN;
process.env.CEPX_API_TOKEN="cepx-test-token";
const runtime=createRuntime({cepx:{file:join(dir,"state.json")},masterKey:"cepx-api-test"});
const server=startServer({runtime,port:0});
try{
 await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
 const url="http://127.0.0.1:"+server.address().port;
 let response=await fetch(url+"/api/cepx/projects");
 assert.equal(response.status,403,"token-protected API rejects missing credentials");
 const headers={"content-type":"application/json",authorization:"Bearer cepx-test-token"};
 response=await fetch(url+"/api/cepx/projects",{method:"POST",headers,body:JSON.stringify({id:"api-project",name:"API Project"})});
 assert.equal(response.status,201);assert.equal((await response.json()).project.id,"api-project");
 response=await fetch(url+"/api/cepx/projects/api-project/tasks",{method:"POST",headers,body:JSON.stringify({title:"API task"})});
 assert.equal(response.status,201);const task=await response.json();assert.equal(task.created,true);
 response=await fetch(url+"/api/cepx/projects/api-project/checkpoint",{method:"POST",headers,body:JSON.stringify({reason:"api test"})});
 assert.equal(response.status,201,await response.clone().text());
 response=await fetch(url+"/api/cepx/projects/api-project",{headers});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.project.tasks.length,1);assert.equal(data.recovery.length,1);assert.equal(data.recovery[0].valid,true);
 response=await fetch(url+"/ui/cepx.html");assert.equal(response.status,200);assert.match(await response.text(),/CEPX Control Center/);
 const {CEPX}=await import("../cepx/index.mjs");const restarted=new CEPX({file:join(dir,"state.json")});assert.equal((await restarted.get("api-project")).tasks.length,1,"state survives engine re-instantiation");
 const dependent=await restarted.enqueue("api-project",{title:"dependent",dependsOn:[task.task.id]});assert.equal(dependent.created,true);await assert.rejects(()=>restarted.transition("api-project",dependent.task.id,"running"),/DEPENDENCIES_INCOMPLETE/);
 response=await fetch(url+"/api/cepx/context/compress",{method:"POST",headers,body:JSON.stringify({input:{project:"api-project",goal:"persist",rules:["no secrets"]},maxChars:512})});
 assert.equal(response.status,200);assert.ok((await response.json()).checksum);
 console.log("CEPX API tests PASS: bearer auth, project CRUD, task ledger, checkpoint inspection, context compression");
}finally{
 await new Promise(resolve=>server.close(resolve));
 if(prior===undefined)delete process.env.CEPX_API_TOKEN;else process.env.CEPX_API_TOKEN=prior;
 await rm(dir,{recursive:true,force:true});
}

import {createHash, randomUUID} from "node:crypto";
import {mkdir,readFile,rename,writeFile,rm,stat,utimes,open} from "node:fs/promises";
import {dirname} from "node:path";
import {hostname} from "node:os";
import {setTimeout as delay} from "node:timers/promises";
import {isAbsolute} from "node:path";
const hash=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const clone=v=>structuredClone(v);
const allowed={pending:["running","blocked","cancelled"],running:["completed","failed","blocked","pending"],failed:["pending","running","cancelled"],blocked:["pending","running","cancelled"],completed:[],cancelled:[]};
export class CEPX {
 constructor({file="./data/cepx/projects.json",clock=()=>Date.now(),lockTimeoutMs=15000,lockLeaseMs=30000,lockRetryMs=25,store=null}={}){
  this.file=file;this.store=store;this.clock=clock;this.queue=Promise.resolve();this.tools=new Map();this.health=new Map();
  this.lockDir=file+".lock";this.lockTimeoutMs=lockTimeoutMs;this.lockLeaseMs=lockLeaseMs;this.lockRetryMs=lockRetryMs;this.host=hostname();
 }
 async ready(){if(this.store?.migrate)await this.store.migrate();return this;}
 async close(){if(this.store?.close)await this.store.close();}
 async #read(){if(this.store)return this.store.read();await mkdir(dirname(this.file),{recursive:true});try{const x=JSON.parse(await readFile(this.file,"utf8"));if(x.schema!==1||!x.projects||typeof x.projects!=="object")throw Error("CEPX_STATE_CORRUPT");return x;}catch(e){if(e.code==="ENOENT")return {schema:1,projects:{}};throw e;}}
 async #write(x){
  const tmp=this.file+"."+process.pid+"."+randomUUID()+".tmp";
  let f;try{f=await open(tmp,"wx",0o600);await f.writeFile(JSON.stringify(x));await f.sync();await f.close();f=null;await rename(tmp,this.file);try{const dir=await open(dirname(this.file),"r");await dir.sync();await dir.close();}catch{}}
  finally{if(f)await f.close().catch(()=>{});await rm(tmp,{force:true}).catch(()=>{});}
 }
 async #lockOwner(){try{return JSON.parse(await readFile(this.lockDir+"/owner.json","utf8"));}catch{return null;}}
 async #alive(owner){
  if(!owner||owner.host!==this.host||!Number.isInteger(owner.pid))return false;
  try{process.kill(owner.pid,0);return true;}catch(e){return e.code==="EPERM";}
 }
 async #breakStale(){
  let info;try{info=await stat(this.lockDir);}catch(e){if(e.code==="ENOENT")return true;throw e;}
  const owner=await this.#lockOwner(), age=this.clock()-info.mtimeMs;
  if(await this.#alive(owner))return false;
  if(age<this.lockLeaseMs)return false;
  const tomb=this.lockDir+".stale."+randomUUID();
  try{await rename(this.lockDir,tomb);await rm(tomb,{recursive:true,force:true});return true;}
  catch(e){if(e.code==="ENOENT"||e.code==="EEXIST")return true;throw e;}
 }
 async #acquire(){
  const started=this.clock(),token=randomUUID();
  await mkdir(dirname(this.file),{recursive:true});
  for(let attempt=0;;attempt++){
   try{
    await mkdir(this.lockDir);
    const owner={token,pid:process.pid,host:this.host,createdAt:this.clock(),heartbeatAt:this.clock()};
    try{await writeFile(this.lockDir+"/owner.json",JSON.stringify(owner),{flag:"wx",mode:0o600});}
    catch(e){await rm(this.lockDir,{recursive:true,force:true});throw e;}
    let stopped=false,busy=false;
    const heartbeat=setInterval(async()=>{if(stopped||busy)return;busy=true;try{const current=await this.#lockOwner();if(current?.token!==token){stopped=true;return;}current.heartbeatAt=this.clock();await writeFile(this.lockDir+"/owner.json",JSON.stringify(current),{mode:0o600});const now=new Date();await utimes(this.lockDir,now,now);}catch{}finally{busy=false;}},Math.max(250,Math.floor(this.lockLeaseMs/3)));
    heartbeat.unref?.();
    return async()=>{stopped=true;clearInterval(heartbeat);const current=await this.#lockOwner();if(current?.token===token)await rm(this.lockDir,{recursive:true,force:true});};
   }catch(e){
    if(e.code!=="EEXIST")throw e;
    await this.#breakStale();
    if(this.clock()-started>=this.lockTimeoutMs)throw Object.assign(Error("CEPX_LOCK_TIMEOUT"),{code:"CEPX_LOCK_TIMEOUT"});
    await delay(Math.min(250,this.lockRetryMs*(1+Math.floor(attempt/4))));
   }
  }
 }
 async #tx(fn){
  const p=this.queue.then(async()=>{
   if(this.store)return clone(await this.store.transaction(fn));
   const release=await this.#acquire();
   try{const state=await this.#read(),value=await fn(state);await this.#write(state);return clone(value);}
   finally{await release();}
  });
  this.queue=p.catch(()=>{});return p;
 }
 async list(){await this.queue;return Object.values((await this.#read()).projects).map(clone);}
 async get(id){await this.queue;const p=(await this.#read()).projects[id];return p?clone(p):null;}
 async ensureProject(id,meta={}){if(!id)throw Error("PROJECT_ID_REQUIRED");return this.#tx(s=>s.projects[id]??(s.projects[id]={id,name:meta.name??id,goal:meta.goal??"",rules:[],decisions:[],blockers:[],tasks:[],checkpoints:[],createdAt:this.clock(),updatedAt:this.clock()}));}
 async updateProject(id,patch){return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");Object.assign(p,clone(patch),{updatedAt:this.clock()});return p;});}
 async enqueue(id,{title,description="",fingerprint,dependsOn=[],taskId}={}){if(!title?.trim())throw Error("TASK_TITLE_REQUIRED");return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");const fp=fingerprint??hash([title.trim().toLowerCase(),description.trim().toLowerCase()]);const old=p.tasks.find(t=>t.fingerprint===fp&&t.status!=="cancelled");if(old)return {task:old,created:false};for(const d of dependsOn)if(!p.tasks.some(t=>t.id===d))throw Error("DEPENDENCY_NOT_FOUND:"+d);const t={id:taskId??randomUUID(),title:title.trim(),description,fingerprint:fp,dependsOn:[...dependsOn],status:"pending",attempts:0,history:[{status:"pending",at:this.clock()}]};p.tasks.push(t);p.updatedAt=this.clock();return {task:t,created:true};});}
 async enqueueMany(id,items=[]){if(!Array.isArray(items))throw Error("TASKS_MUST_BE_ARRAY");return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");const known=new Map(p.tasks.filter(t=>t.status!=="cancelled").map(t=>[t.fingerprint,t]));const results=[];for(const item of items){const title=item?.title;if(!title?.trim())throw Error("TASK_TITLE_REQUIRED");const description=item.description??"",fp=item.fingerprint??hash([title.trim().toLowerCase(),description.trim().toLowerCase()]);const old=known.get(fp);if(old){results.push({task:old,created:false});continue;}for(const dep of item.dependsOn??[])if(!p.tasks.some(t=>t.id===dep))throw Error("DEPENDENCY_NOT_FOUND:"+dep);const task={id:item.taskId??randomUUID(),title:title.trim(),description,fingerprint:fp,dependsOn:[...(item.dependsOn??[])],status:"pending",attempts:0,history:[{status:"pending",at:this.clock()}]};p.tasks.push(task);known.set(fp,task);results.push({task,created:true});}p.updatedAt=this.clock();return results;});}
 async transition(id,taskId,status,{reason="",evidence=null}={}){if(!Object.hasOwn(allowed,status))throw Error("INVALID_TASK_STATUS");return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");const t=p.tasks.find(x=>x.id===taskId);if(!t)throw Error("TASK_NOT_FOUND");if(!allowed[t.status].includes(status))throw Error("INVALID_TRANSITION");if(status==="running"){const missing=t.dependsOn.filter(d=>!p.tasks.some(x=>x.id===d&&x.status==="completed"));if(missing.length)throw Error("DEPENDENCIES_INCOMPLETE");t.attempts++;}t.status=status;t.history.push({status,at:this.clock(),reason,evidence});t.history=t.history.slice(-100);p.active=status==="running"?taskId:(p.active===taskId?null:p.active);p.updatedAt=this.clock();return t;});}
 compress(input,{maxChars=12000,charsPerToken=4}={}){if(!input||typeof input!=="object"||!Number.isInteger(maxChars)||maxChars<256)throw Error("INVALID_CONTEXT_INPUT");const groups=[["PROJECT",[input.project,input.goal].filter(Boolean),true],["RULES",input.rules??[],true],["DECISIONS",input.decisions??[],false],["CURRENT STATE",[input.activeTask,input.currentState].filter(Boolean),true],["BLOCKERS",input.blockers??[],true],["NEXT ACTIONS",input.nextActions??[],false],["EVIDENCE",input.evidence??[],false],["COMPLETED",input.completed??[],false]];let out=[],used=0,omittedItems=0;for(const [name,raw,required] of groups){const lines=[...new Set(raw.map(x=>typeof x==="string"?x:JSON.stringify(x)).filter(Boolean))];if(!lines.length)continue;const h="## "+name;if(used+h.length+3>maxChars){if(required)throw Error("CONTEXT_BUDGET_TOO_SMALL");omittedItems+=lines.length;continue;}out.push(h);used+=h.length;let accepted=0;for(let i=0;i<lines.length;i++){const line="- "+lines[i];if(used+line.length+1<=maxChars){out.push(line);used+=line.length+1;accepted++;}else{omittedItems+=lines.length-i;break;}}if(required&&!accepted)throw Error("MANDATORY_CONTEXT_MISSING");}const summary=out.join("\n");return {summary,chars:summary.length,estimatedTokens:Math.ceil(summary.length/charsPerToken),omittedItems,checksum:createHash("sha256").update(summary).digest("hex")};}
 async checkpoint(id,reason="automatic"){return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");const state={...p,checkpoints:undefined};const data={project:state,reason,at:this.clock()};const c={id:randomUUID(),data,checksum:hash(data),at:this.clock(),reason};p.checkpoints.push(c);p.checkpoints=p.checkpoints.slice(-50);return {id:c.id,checksum:c.checksum,at:c.at};});}
 async inspect(id){const p=await this.get(id);if(!p)throw Error("PROJECT_NOT_FOUND");return (p.checkpoints??[]).map(c=>({id:c.id,at:c.at,reason:c.reason,valid:hash(c.data)===c.checksum}));}
 async restore(id,checkpointId){return this.#tx(s=>{const p=s.projects[id];if(!p)throw Error("PROJECT_NOT_FOUND");const c=[...p.checkpoints].reverse().find(x=>(!checkpointId||x.id===checkpointId)&&hash(x.data)===x.checksum);if(!c)throw Error("NO_VALID_CHECKPOINT");const history=p.checkpoints;Object.assign(p,clone(c.data.project),{checkpoints:history,recoveredFrom:c.id,updatedAt:this.clock()});return p;});}
 registerTool({id,run,priority=100}){if(!id||typeof run!=="function"||this.tools.has(id))throw Error("INVALID_TOOL");this.tools.set(id,{id,run,priority});this.health.set(id,{failures:0,openedAt:0});}
 async execute(input,{timeoutMs=15000,retries=1,cooldownMs=30000}={}){const attempts=[];for(const t of [...this.tools.values()].sort((a,b)=>a.priority-b.priority)){const h=this.health.get(t.id);if(h.openedAt&&this.clock()-h.openedAt<cooldownMs){attempts.push({tool:t.id,status:"circuit-open"});continue;}for(let n=0;n<=retries;n++){let timer;try{const result=await Promise.race([Promise.resolve().then(()=>t.run(input)),new Promise((_,rej)=>timer=setTimeout(()=>rej(Object.assign(Error("TOOL_TIMEOUT"),{code:"TIMEOUT"})),timeoutMs))]);clearTimeout(timer);h.failures=0;h.openedAt=0;return {provider:t.id,result,attempts:[...attempts,{tool:t.id,status:"success"}]};}catch(e){clearTimeout(timer);h.failures++;h.openedAt=this.clock();attempts.push({tool:t.id,status:"failed",error:String(e.message??e)});if(n<retries&&["429","500","502","503","504","TIMEOUT","ECONNRESET"].some(x=>String(e.code??e.message).includes(x)))await delay(100*(n+1));else break;}}}const e=Error("ALL_TOOLS_FAILED");e.attempts=attempts;throw e;}
 async handoff(id,{maxChars=12000}={}){const p=await this.get(id);if(!p)throw Error("PROJECT_NOT_FOUND");const handoff=this.compress({project:p.name,goal:p.goal,rules:p.rules,decisions:p.decisions,activeTask:p.active,currentState:p.currentState,blockers:p.blockers,nextActions:p.tasks.filter(t=>!["completed","cancelled"].includes(t.status)).map(t=>t.title+" ["+t.status+"]"),completed:p.tasks.filter(t=>t.status==="completed").map(t=>t.title)},{maxChars});await this.updateProject(id,{handoff,updatedAt:this.clock()});return handoff;}
}

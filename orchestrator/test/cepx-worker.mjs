import {CEPX} from "../cepx/index.mjs";
const [file,workerId,countRaw]=process.argv.slice(2);const count=Number(countRaw);
const c=new CEPX({file,lockTimeoutMs:30000,lockLeaseMs:5000,lockRetryMs:5});
await c.ensureProject("shared",{name:"Shared multiprocess project"});
const results=await Promise.all(Array.from({length:count},(_,i)=>c.enqueue("shared",{title:"worker-"+workerId+"-task-"+i})));
const dup=await Promise.all(Array.from({length:8},()=>c.enqueue("shared",{title:"global-idempotent-task"})));
if(results.some(x=>!x.created)||dup.filter(x=>x.created).length>1)throw Error("WORKER_ASSERTION_FAILED");
console.log(JSON.stringify({workerId,created:results.filter(x=>x.created).length,duplicateCreated:dup.filter(x=>x.created).length}));

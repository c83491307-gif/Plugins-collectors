import assert from "node:assert/strict";
import {createRuntime} from "../runtime.mjs";

const originalFetch=globalThis.fetch;
const seen=[];
globalThis.fetch=async(_url,init)=>{
  const auth=init?.headers?.Authorization??"";
  seen.push(auth);
  const account=auth.includes("a1")?"model-a1":"model-a2";
  return new Response(JSON.stringify({data:[{id:account}]}),{status:200,headers:{"content-type":"application/json"}});
};
try{
  const r=createRuntime({masterKey:"sync-rotation-test"});
  r.connections.add({provider:"deepseek",secret:"a1-secret",accountId:"a1"});
  r.connections.add({provider:"deepseek",secret:"a2-secret",accountId:"a2"});
  const models=await r.providers.syncProvider("deepseek");
  assert.equal(models.length,2);
  assert.deepEqual(new Set(models.map(x=>x.id)),new Set(["model-a1","model-a2"]));
  assert.equal(seen.length,2);
  assert.notEqual(seen[0],seen[1]);
  console.log("PROVIDER SYNC ROTATION TEST: PASS");
}finally{globalThis.fetch=originalFetch;}
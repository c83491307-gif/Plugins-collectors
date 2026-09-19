import assert from "node:assert/strict";
import {createRuntime} from "../runtime.mjs";

const originalFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async(_url,init)=>{
  calls++;
  if(calls===1)return new Response(JSON.stringify({error:{message:"rate limited"}}),{status:429,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({id:"chatcmpl-test",choices:[{message:{role:"assistant",content:"ok"}}],usage:{total_tokens:3}}),{status:200,headers:{"content-type":"application/json"}});
};
try{
  const r=createRuntime({masterKey:"failover-test"});
  r.connections.add({provider:"deepseek",secret:"sk-abcdefghijklmnop",accountId:"a1"});
  r.connections.add({provider:"deepseek",secret:"sk-bcdefghijklmnop",accountId:"a2"});
  const model=r.providers.registerModel({id:"deepseek-test",provider:"deepseek",capabilities:["chat"]});
  const first=await r.providers.invoke(model,{model:"deepseek-test",messages:[{role:"user",content:"ping"}]});
  assert.equal(first.choices[0].message.content,"ok");
  assert.equal(calls,2);
  const accounts=r.connections.list("deepseek");
  assert.equal(accounts.length,2);
}finally{globalThis.fetch=originalFetch;}
console.log("ACCOUNT FAILOVER TEST: PASS");

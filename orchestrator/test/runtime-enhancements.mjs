import assert from "node:assert/strict";
import {createRuntime} from "../runtime.mjs";

const r=createRuntime({masterKey:"runtime-test-master",routing:{preferredProviders:["nvidia","openai"]}});
r.registry.register({id:"nvidia-code",provider:"nvidia",capabilities:["chat","code"],priority:80});
r.registry.register({id:"openai-code",provider:"openai",capabilities:["chat","code"],priority:60});

const plan=r.scheduler.plan({taskClass:"code",capabilities:["code"]});
assert.deepEqual(plan.candidates,["nvidia-code","openai-code"]);
assert.equal(plan.maxAttempts,2);

const k1=r.contextCache.set({system:"x",messages:[{role:"user",content:"hello"}]},{tokens:12});
assert.deepEqual(r.contextCache.get({messages:[{content:"hello",role:"user"}],system:"x"}),{tokens:12});
assert.equal(typeof k1,"string");

const lru=new (r.contextCache.constructor)({maxEntries:2,ttlMs:60_000});
lru.set({id:1},"one");
lru.set({id:2},"two");
assert.equal(lru.get({id:1}),"one");
lru.set({id:3},"three");
assert.equal(lru.get({id:1}),"one");
assert.equal(lru.get({id:2}),undefined);
assert.equal(lru.get({id:3}),"three");

r.circuitBreaker.failure("nvidia-code");
r.circuitBreaker.failure("nvidia-code");
r.circuitBreaker.failure("nvidia-code");
assert.equal(r.scheduler.plan({capabilities:["code"]}).candidates.includes("nvidia-code"),false);
assert.equal(r.scheduler.plan({capabilities:["missing"]}).parallel,0);

const calls=[];
r.circuitBreaker.success("nvidia-code");
const runResult=await r.scheduler.run({capabilities:["code"],maxAttempts:2},async (model)=>{
  calls.push(model.id);
  if(model.id==="nvidia-code") throw Object.assign(new Error("temporary"),{code:"TEMPORARY"});
  return {ok:true,model:model.id};
});
assert.deepEqual(runResult,{ok:true,model:"openai-code"});
assert.deepEqual(calls,["nvidia-code","openai-code"]);
assert.equal(r.circuitBreaker.canTry("openai-code"),true);

await assert.rejects(
  () => r.scheduler.run({capabilities:["code"],maxAttempts:1},async()=>{throw Object.assign(new Error("down"),{code:"PROVIDER_DOWN"});}),
  (error)=>error.code==="SCHEDULE_EXHAUSTED" && error.failures.length===1
);

console.log("RUNTIME ENHANCEMENTS TEST: PASS");

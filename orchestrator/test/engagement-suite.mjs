import assert from "node:assert/strict";
import {createRuntime} from "../runtime.mjs";

const r=createRuntime({delivery:{perMinute:2,quietHours:[[0,1]]}});
r.compliance.optIn("c1",["marketing"]);
r.compliance.optOut("c2",["marketing"]);
r.audience.import([
 {id:"c1",tags:["vip"],country:"EG"},
 {id:"c2",tags:["vip"],country:"EG"},
 {id:"c3",tags:["new"],country:"EG"}
]);
r.audience.define("vip-eg",c=>c.country==="EG"&&(c.tags??[]).includes("vip"));
assert.equal(r.audience.evaluate("vip-eg").length,2);

r.templates.upsert({name:"offer",body:"Hello {{name}}, your code is {{code}}"});
r.templates.approve("offer");
assert.equal(r.templates.render("offer",{name:"A",code:"X9"}),"Hello A, your code is X9");

const campaign=r.campaigns.create({id:"cmp1",template:"offer",category:"marketing"});
assert.equal(r.campaigns.enqueue("cmp1",r.audience.evaluate("vip-eg")),1);
const sent=[];
const result=await r.campaigns.drain("cmp1",async ({contact})=>{sent.push(contact.id);return {ok:true};});
assert.deepEqual(result,{delivered:1,failed:0});
assert.deepEqual(sent,["c1"]);
assert.equal(r.campaigns.status("cmp1").sent,1);

r.automation.register({id:"lead-flow",steps:[{action:"tag"},{action:"assign"}]});
const flowResult=await r.automation.run("lead-flow",{id:"c1"},{tag:async(s)=>({...s,tags:["qualified"]}),assign:async(s)=>({...s,owner:"sales"})});
assert.deepEqual(flowResult,{id:"c1",tags:["qualified"],owner:"sales"});

r.channels.register("primary",{send:async message=>({channel:"primary",message})});
assert.deepEqual(await r.channels.send("hello",{preferred:["primary"]}),{channel:"primary",message:"hello"});

r.analytics.track("sent",{campaignId:"cmp1"});
r.analytics.track("delivered",{campaignId:"cmp1"});
r.analytics.track("read",{campaignId:"cmp1"});
r.analytics.track("replied",{campaignId:"cmp1"});
const summary=r.analytics.summarize("cmp1");
assert.equal(summary.replyRate,1);

r.audit.record("campaign.created","system",{campaignId:"cmp1"});
assert.equal(r.audit.all().length,1);

const governor=r.deliveryGovernor;
assert.equal(governor.acquire(new Date("2026-09-20T10:00:00")).ok,true);
assert.equal(governor.acquire(new Date("2026-09-20T10:00:10")).ok,true);
assert.equal(governor.acquire(new Date("2026-09-20T10:00:20")).code,"RATE_LIMIT");
assert.equal(governor.acquire(new Date("2026-09-20T00:30:00")).code,"QUIET_HOURS");

const experiment=r.experiments.create({id:"subject-test",variants:["A","B"]});
assert.equal(r.experiments.assign("subject-test","user-1"),r.experiments.assign("subject-test","user-1"));

assert.equal(r.leadScoring.score({tags:["vip"]},{rules:[{when:c=>c.tags?.includes("vip"),points:40}]}),40);
assert.equal(r.leadScoring.rank([{id:"a"},{id:"b",hot:true}],{rules:[{when:c=>c.hot,points:10}]})[0].id,"b");

assert.equal(r.idempotency.has("x"),false);
r.idempotency.set("x");
assert.equal(r.idempotency.has("x"),true);

console.log("ENGAGEMENT SUITE TEST: PASS");

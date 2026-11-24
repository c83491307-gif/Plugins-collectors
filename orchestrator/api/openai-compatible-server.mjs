import {createServer} from "node:http";
import {completeDeepSeekConnection,beginDeepSeekConnection} from "../auth/deepseek-flow.mjs";
import {serveUI} from "../web/ui-handler.mjs";
export function startServer({runtime,port=8787}){return createServer(async(req,res)=>{try{
if(req.url?.startsWith("/ui")){if(await serveUI(req,res))return;}
if(req.url?.startsWith("/api/cepx/")){
 const token=process.env.CEPX_API_TOKEN, supplied=String(req.headers.authorization??"").replace(/^Bearer\s+/i,"");
 const configured=JSON.parse(process.env.CEPX_API_PRINCIPALS??"{}");
 const ip=req.socket.remoteAddress, local=ip==="127.0.0.1"||ip==="::1"||ip==="::ffff:127.0.0.1";
 if(token?(supplied!==token&&!configured[supplied]):(!local&&!configured[supplied]))return json(res,403,{error:{message:"CEPX_ACCESS_DENIED"}});
 await runtime.cepx.ready();
 let principal=configured[supplied];
 if(!principal&&token&&supplied===token)principal={tenantId:"default",userId:"legacy-owner"};
 if(!principal&&local&&!token)principal={tenantId:"default",userId:"local-owner"};
 if(!principal?.tenantId||!principal?.userId)return json(res,403,{error:{message:"CEPX_PRINCIPAL_REQUIRED"}});
 const {tenantId,userId}=principal, enterprise=runtime.cepx.enterprise;
 let state=await enterprise.snapshot();
 if(tenantId==="default"&&!state.tenants?.[tenantId]){await enterprise.createTenant(tenantId,{name:"Default tenant"});await enterprise.grant(tenantId,userId,"owner");}
 await enterprise.consumeRequest(tenantId,userId);
 const u=new URL(req.url,"http://localhost"), a=u.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent), m=req.method??"GET";
 if(a[0]==="projects"&&a.length===1&&m==="GET")return json(res,200,await enterprise.listProjects(tenantId,userId,{cursor:u.searchParams.get("cursor"),limit:Number(u.searchParams.get("limit")??50),search:u.searchParams.get("search")??"",sort:u.searchParams.get("sort")??"updatedAt",direction:u.searchParams.get("direction")??"desc"}));
 if(a[0]==="projects"&&a.length===1&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,{project:await enterprise.createProject(tenantId,userId,p.id,p)});}
 if(a[0]==="projects"&&a.length===2&&m==="GET"){const p=await enterprise.getProject(tenantId,userId,a[1]);return json(res,200,{project:p,recovery:p.checkpoints.map(c=>({id:c.id,valid:c.valid!==false,signed:!!c.signature}))});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="tasks"&&m==="GET")return json(res,200,await enterprise.listTasks(tenantId,userId,a[1],{cursor:u.searchParams.get("cursor"),limit:Number(u.searchParams.get("limit")??50),status:u.searchParams.get("status"),search:u.searchParams.get("search")??"",sort:u.searchParams.get("sort")??"createdAt",direction:u.searchParams.get("direction")??"desc"}));
 if(a[0]==="projects"&&a.length===3&&a[2]==="tasks"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,{task:await enterprise.addTask(tenantId,userId,a[1],p),created:true});}
 if(a[0]==="projects"&&a.length===4&&a[2]==="tasks"&&m==="PATCH"){const p=JSON.parse(await readBody(req)||"{}");state=await enterprise.snapshot();const project=state.projects[a[1]];if(!project||project.tenantId!==tenantId)throw Object.assign(Error("PROJECT_NOT_FOUND"),{code:"PROJECT_NOT_FOUND"});enterprise.authorize(state,tenantId,userId,"write");return json(res,200,{task:await runtime.cepx.transition(a[1],a[3],p.status,p)});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="checkpoint"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,await enterprise.signCheckpoint(tenantId,userId,a[1],p.reason));}
 if(a[0]==="projects"&&a.length===3&&a[2]==="recover"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,{project:await enterprise.restoreSignedCheckpoint(tenantId,userId,a[1],p.checkpointId)});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="handoff"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");await enterprise.getProject(tenantId,userId,a[1]);return json(res,200,await runtime.cepx.handoff(a[1],p));}
 if(a[0]==="context"&&a[1]==="compress"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,runtime.cepx.compress(p.input,p));}
 if(a[0]==="tenants"&&a.length===1&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");enterprise.authorize(state,tenantId,userId,"manage");return json(res,201,await enterprise.createTenant(p.id,p));}
 if(a[0]==="admin"&&a.length===1&&m==="GET")return json(res,200,await enterprise.tenantAdminOverview(tenantId,userId));
 if(a[0]==="members"&&a.length===1&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,{member:await enterprise.setTenantMemberRole(tenantId,userId,p.userId,p.role)});}
 if(a[0]==="members"&&a.length===2&&m==="DELETE")return json(res,200,{revoked:await enterprise.revokeTenantMember(tenantId,userId,a[1])});
 if(a[0]==="quota"&&a.length===1&&m==="PUT"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,{quota:await enterprise.setQuota(tenantId,userId,{tasks:p.tasks,requestsPerMinute:p.requestsPerMinute})});}
 if(a[0]==="plugins"&&a.length===1&&m==="GET")return json(res,200,{items:await enterprise.listTenantPluginContracts(tenantId,userId)});
 if(a[0]==="plugins"&&a.length===1&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,{plugin:await enterprise.registerTenantPluginContract(tenantId,userId,p.id,p)});}
 if(a[0]==="plugins"&&a.length===3&&a[2]==="enable"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");const caps=JSON.parse(process.env.CEPX_HOST_CAPABILITIES??"[]");return json(res,200,{plugin:await enterprise.setTenantPluginEnabled(tenantId,userId,a[1],true,caps)});}
 if(a[0]==="plugins"&&a.length===3&&a[2]==="disable"&&m==="POST")return json(res,200,{plugin:await enterprise.setTenantPluginEnabled(tenantId,userId,a[1],false,[])});
 if(a[0]==="events"&&a.length===1&&m==="GET"){enterprise.authorize(state,tenantId,userId,"read");const events=(state.events??[]).filter(e=>e.tenantId===tenantId);const limit=Math.min(100,Math.max(1,Number(u.searchParams.get("limit")??25)));return json(res,200,{items:events.slice(-limit).reverse(),total:events.length});}
 if(a[0]==="events"&&a[1]==="verify"&&m==="GET")return json(res,200,await enterprise.verifyEvents(tenantId));
 if(a[0]==="backup"&&m==="GET")return json(res,200,await enterprise.backup(tenantId,userId));
 if(a[0]==="health"&&m==="GET")return json(res,200,enterprise.health());
 return json(res,404,{error:{message:"CEPX_ROUTE_NOT_FOUND"}});
}

if(req.url==="/healthz"){return json(res,200,{status:"ok"});}
if(req.url==="/v1/models"){return json(res,200,{object:"list",data:runtime.registry.models.map(m=>({id:m.id,object:"model",owned_by:m.provider}))});}
if(req.url?.match(/^\/providers\/[^/]+\/sync$/)&&req.method==="POST"){
  const provider=decodeURIComponent(req.url.split("/")[2]);
  const models=await runtime.providers.syncProvider(provider);
  return json(res,200,{provider,models:models.map(m=>({id:m.id,object:"model",owned_by:m.provider})),count:models.length});
}
if(req.url==="/connections/deepseek/start"){return json(res,200,beginDeepSeekConnection({returnTo:"/settings/connections"}));}
if(req.url==="/connections/deepseek/complete"&&req.method==="POST"){
  const p=JSON.parse(await readBody(req)||"{}");
  if(!runtime.connections)throw Object.assign(new Error("APP_MASTER_KEY_REQUIRED"),{code:"CONFIGURATION_ERROR"});
  const id=completeDeepSeekConnection({connectionManager:runtime.connections,apiKey:p.apiKey,label:p.label,accountId:p.accountId});
  const models=await runtime.providers?.syncProvider("deepseek")??[];
  return json(res,201,{provider:"deepseek",connectionId:id,models:models.map(m=>m.id)});
}
if(req.url==="/connections"&&req.method==="GET"){if(!runtime.connections)return json(res,200,{connections:[]});return json(res,200,{connections:runtime.connections.list()});}
if(req.url==="/v1/chat/completions"&&req.method==="POST"){
  const payload=JSON.parse(await readBody(req)||"{}");
  const result=await runtime.router.execute(payload,async(model)=>{
    if(!model.adapter)throw Object.assign(new Error("ADAPTER_NOT_BOUND"),{code:"ADAPTER_NOT_BOUND"});
    return runtime.providers?.invoke(model,payload)??model.adapter.invoke(payload);
  });
  return json(res,200,result.result);
}
return json(res,404,{error:{message:"Not found"}});
}catch(e){json(res,e.code==="TENANT_LAST_OWNER"?409:e.code==="RATE_LIMIT"||e.code==="CEPX_RATE_LIMITED"?429:e.code==="UNAUTHORIZED"?401:e.code==="CEPX_FORBIDDEN"||e.code==="CEPX_ACCESS_DENIED"||e.code==="CEPX_PRINCIPAL_REQUIRED"?403:e.code==="PROJECT_NOT_FOUND"||e.code==="PLUGIN_CONTRACT_NOT_FOUND"||e.code==="TENANT_MEMBER_NOT_FOUND"?404:e.code==="INVALID_CREDENTIAL"||e.code==="PLUGIN_CONTRACT_INVALID"||e.code==="PLUGIN_CAPABILITY_MISMATCH"||e.code==="RBAC_ROLE_INVALID"?400:e.code==="NO_AVAILABLE_CONNECTION"?503:500,{error:{message:String(e.message||e),code:e.code||"ERROR"}});}}).listen(port);}
function json(res,status,body){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(body));}
function readBody(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>10*1024*1024)reject(new Error("BODY_TOO_LARGE"));});req.on("end",()=>resolve(s));req.on("error",reject);});}

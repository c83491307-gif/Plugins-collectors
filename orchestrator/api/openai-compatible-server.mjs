import {createServer} from "node:http";
import {completeDeepSeekConnection,beginDeepSeekConnection} from "../auth/deepseek-flow.mjs";
import {serveUI} from "../web/ui-handler.mjs";
export function startServer({runtime,port=8787}){return createServer(async(req,res)=>{try{
if(req.url?.startsWith("/ui")){if(await serveUI(req,res))return;}
if(req.url?.startsWith("/api/cepx/")){
 const token=process.env.CEPX_API_TOKEN, supplied=String(req.headers.authorization??"").replace(/^Bearer\s+/i,"");
 const ip=req.socket.remoteAddress, local=ip==="127.0.0.1"||ip==="::1"||ip==="::ffff:127.0.0.1";
 if(token?supplied!==token:!local)return json(res,403,{error:{message:"CEPX_ACCESS_DENIED"}});
 const u=new URL(req.url,"http://localhost"), a=u.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent), m=req.method??"GET";
 if(a[0]==="projects"&&a.length===1&&m==="GET")return json(res,200,{projects:await runtime.cepx.list()});
 if(a[0]==="projects"&&a.length===1&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,{project:await runtime.cepx.ensureProject(p.id,p)});}
 if(a[0]==="projects"&&a.length===2&&m==="GET"){const p=await runtime.cepx.get(a[1]);return p?json(res,200,{project:p,recovery:await runtime.cepx.inspect(a[1])}):json(res,404,{error:{message:"PROJECT_NOT_FOUND"}});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="tasks"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,await runtime.cepx.enqueue(a[1],p));}
 if(a[0]==="projects"&&a.length===4&&a[2]==="tasks"&&m==="PATCH"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,{task:await runtime.cepx.transition(a[1],a[3],p.status,p)});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="checkpoint"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,201,await runtime.cepx.checkpoint(a[1],p.reason));}
 if(a[0]==="projects"&&a.length===3&&a[2]==="recover"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,{project:await runtime.cepx.restore(a[1],p.checkpointId)});}
 if(a[0]==="projects"&&a.length===3&&a[2]==="handoff"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,await runtime.cepx.handoff(a[1],p));}
 if(a[0]==="context"&&a[1]==="compress"&&m==="POST"){const p=JSON.parse(await readBody(req)||"{}");return json(res,200,runtime.cepx.compress(p.input,p));}
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
}catch(e){json(res,e.code==="RATE_LIMIT"?429:e.code==="UNAUTHORIZED"?401:e.code==="INVALID_CREDENTIAL"?400:e.code==="NO_AVAILABLE_CONNECTION"?503:500,{error:{message:String(e.message||e),code:e.code||"ERROR"}});}}).listen(port);}
function json(res,status,body){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(body));}
function readBody(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>10*1024*1024)reject(new Error("BODY_TOO_LARGE"));});req.on("end",()=>resolve(s));req.on("error",reject);});}

import {createServer} from "node:http";
import {completeDeepSeekConnection,beginDeepSeekConnection} from "../auth/deepseek-flow.mjs";
export function startServer({runtime,port=8787}){return createServer(async(req,res)=>{try{
if(req.url==="/healthz"){return json(res,200,{status:"ok"});}
if(req.url==="/v1/models"){return json(res,200,{object:"list",data:runtime.registry.models.map(m=>({id:m.id,object:"model",owned_by:m.provider}))});}
if(req.url==="/connections/deepseek/start"){return json(res,200,beginDeepSeekConnection({returnTo:"/settings/connections"}));}
if(req.url==="/connections/deepseek/complete"&&req.method==="POST"){const p=JSON.parse(await readBody(req)||"{}");if(!runtime.connections)throw Object.assign(new Error("APP_MASTER_KEY_REQUIRED"),{code:"CONFIGURATION_ERROR"});const id=completeDeepSeekConnection({connectionManager:runtime.connections,apiKey:p.apiKey,label:p.label,accountId:p.accountId});return json(res,201,{provider:"deepseek",connectionId:id});}
if(req.url==="/connections"&&req.method==="GET"){if(!runtime.connections)return json(res,200,{connections:[]});return json(res,200,{connections:runtime.connections.list()});}
if(req.url==="/v1/chat/completions"&&req.method==="POST"){const payload=JSON.parse(await readBody(req)||"{}");const result=await runtime.router.execute(payload,async(model)=>{if(!model.adapter)throw Object.assign(new Error("ADAPTER_NOT_BOUND"),{code:"ADAPTER_NOT_BOUND"});return model.adapter.invoke(payload);});return json(res,200,result.result);}
return json(res,404,{error:{message:"Not found"}});}catch(e){json(res,e.code==="RATE_LIMIT"?429:e.code==="UNAUTHORIZED"?401:e.code==="INVALID_CREDENTIAL"?400:500,{error:{message:String(e.message||e),code:e.code||"ERROR"}});}}).listen(port);}
function json(res,status,body){res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify(body));}
function readBody(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>10*1024*1024)reject(new Error("BODY_TOO_LARGE"));});req.on("end",()=>resolve(s));req.on("error",reject);});}

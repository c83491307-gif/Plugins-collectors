import {OpenAICompatibleAdapter} from "../providers/openai-compatible.mjs";

const DEFAULTS={
  deepseek:{baseUrl:"https://api.deepseek.com",capabilities:["chat","code","reasoning"]},
  openai:{baseUrl:"https://api.openai.com/v1",capabilities:["chat","code","vision","tool_calling"]},
  nvidia:{baseUrl:"https://integrate.api.nvidia.com/v1",capabilities:["chat","code","vision"]},
  xai:{baseUrl:"https://api.x.ai/v1",capabilities:["chat","code","vision"]},
  google:{baseUrl:"https://generativelanguage.googleapis.com/v1beta/openai",capabilities:["chat","code","vision"]}
};

export class ProviderRuntime {
  constructor({registry,connections,usage}={}){this.registry=registry;this.connections=connections;this.usage=usage;this.adapters=new Map();}
  configure(provider,config={}){
    const d={...(DEFAULTS[provider]??{}),...config,provider,id:provider};
    if(!d.baseUrl)throw new Error("PROVIDER_BASE_URL_REQUIRED");
    const adapter=new OpenAICompatibleAdapter(d);
    this.adapters.set(provider,adapter);return adapter;
  }
  ensureAdapter(provider,config={}){return this.adapters.get(provider)??this.configure(provider,config);}
  registerModel({id,provider,capabilities=[],priority=50,accountId=""}){
    const adapter=this.ensureAdapter(provider,{capabilities});
    return this.registry.register({id,provider,capabilities:capabilities.length?capabilities:adapter.capabilities,priority,accountId,adapter});
  }
  async syncProvider(provider,config={}){
    if(!this.connections)throw Object.assign(new Error("APP_MASTER_KEY_REQUIRED"),{code:"CONFIGURATION_ERROR"});
    const adapter=this.ensureAdapter(provider,config), accounts=this.connections.list(provider), seen=new Set(), out=[];
    for(const account of accounts){
      let lease;
      try{lease=this.connections.lease(provider);}catch{break;}
      try{
        const models=await adapter.listModels(lease.secret);
        lease.report(true);
        for(const m of models)if(!seen.has(m.id)){seen.add(m.id);out.push(this.registry.register({...m,adapter,accountId:account.accountId||account.id}));}
      }catch(e){lease.report(false,e.code??e.status);}
    }
    return out;
  }
  async invoke(model,payload){
    if(!this.connections)throw Object.assign(new Error("APP_MASTER_KEY_REQUIRED"),{code:"CONFIGURATION_ERROR"});
    const adapter=model.adapter??this.ensureAdapter(model.provider);
    const lease=this.connections.lease(model.provider);
    try{
      const result=await adapter.invoke(payload,lease.secret);
      lease.report(true);
      this.usage?.record({provider:model.provider,model:model.id,ok:true,tokens:result?.usage?.total_tokens??0});
      return result;
    }catch(e){
      lease.report(false,e.code??e.status);
      this.usage?.record({provider:model.provider,model:model.id,ok:false,error:e.code??"MODEL_ERROR"});
      throw e;
    }
  }
}

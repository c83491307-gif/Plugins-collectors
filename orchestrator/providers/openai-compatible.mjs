import {ProviderAdapter} from "./provider-adapter.mjs";
export class OpenAICompatibleAdapter extends ProviderAdapter {
  constructor(definition){super(definition);}
  _base(){return this.definition.baseUrl.replace(/\/$/,"");}
  headers(secret=this.definition.apiKey){
    return secret?{"Authorization":"Bearer "+secret}:{};
  }
  async _request(path,secret,init={}){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.definition.timeoutMs??60000);
    try{
      const r=await fetch(this._base()+path,{...init,signal:controller.signal,headers:{"Content-Type":"application/json",...this.headers(secret),...(init.headers??{})}});
      const bodyText=await r.text(); let body={};
      try{body=bodyText?JSON.parse(bodyText):{};}catch{body={raw:bodyText};}
      if(!r.ok){
        const code=r.status===401||r.status===403?"AUTH_ERROR":r.status===429?"RATE_LIMIT":r.status===402?"QUOTA_EXHAUSTED":r.status>=500?"PROVIDER_DOWN":"INVALID_REQUEST";
        throw Object.assign(new Error(body?.error?.message||bodyText||("HTTP "+r.status)),{code,status:r.status,body});
      }
      return body;
    }catch(e){
      if(e.name==="AbortError") throw Object.assign(new Error("PROVIDER_TIMEOUT"),{code:"PROVIDER_TIMEOUT"});
      throw e;
    }finally{clearTimeout(timer);}
  }
  async health(secret=this.definition.apiKey){await this._request("/models",secret);return {state:"healthy"};}
  async listModels(secret=this.definition.apiKey){
    const body=await this._request("/models",secret);
    return (body.data??[]).map(x=>({id:x.id,provider:this.provider,capabilities:this.capabilities,enabled:true}));
  }
  async invoke(request,secret=this.definition.apiKey){
    return this._request("/chat/completions",secret,{method:"POST",body:JSON.stringify({...request,model:request.model??this.definition.model})});
  }
}
export class ProviderAdapter {
  constructor({provider,baseUrl}={}) {
    if(!provider) throw new Error("PROVIDER_REQUIRED");
    this.provider=provider;
    this.baseUrl=(baseUrl??"").replace(/\/$/,"");
  }
  capabilities(){return ["chat"];}
  async validate(){throw new Error("NOT_IMPLEMENTED");}
  async listModels(){throw new Error("NOT_IMPLEMENTED");}
  async invoke(){throw new Error("NOT_IMPLEMENTED");}
}

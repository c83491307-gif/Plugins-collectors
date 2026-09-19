export class MCPAggregator {
  constructor(gateway){this.gateway=gateway;}

  discover(){
    const out=[];
    for(const server of this.gateway.list()){
      for(const tool of server.tools ?? []){
        out.push({
          name: server.name + "__" + tool.name,
          server: server.name,
          ...tool
        });
      }
    }
    return out;
  }

  resolve(names=[]){
    const requested = new Set(
      (Array.isArray(names) ? names : [names])
        .filter(Boolean)
        .map(String)
    );

    if(!requested.size) return this.discover();

    return this.discover().filter(tool =>
      requested.has(tool.name) ||
      requested.has(tool.server) ||
      requested.has(tool.name.split("__").at(-1))
    );
  }
}

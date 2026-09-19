export class OmnichannelRouter {
  constructor(){this.channels=new Map();}
  register(name,adapter){if(!adapter||typeof adapter.send!=="function")throw new TypeError("adapter.send required");this.channels.set(name,adapter);}
  choose(preferred=[]){for(const name of preferred)if(this.channels.has(name))return this.channels.get(name);return this.channels.values().next().value;}
  async send(message,{preferred=[]}={}){const adapter=this.choose(preferred);if(!adapter)throw new Error("NO_CHANNEL");return adapter.send(message);}
}
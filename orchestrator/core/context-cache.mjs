import {createHash} from "node:crypto";

function stable(value){
  if(value===null||typeof value!=="object") return value;
  if(Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
}

export class ContextCache {
  constructor({maxEntries=256,ttlMs=15*60*1000}={}) {
    this.maxEntries=Math.max(0,maxEntries);
    this.ttlMs=Math.max(0,ttlMs);
    this.items=new Map();
  }
  key(context){return createHash("sha256").update(JSON.stringify(stable(context))).digest("hex");}
  get(context){
    const k=this.key(context), item=this.items.get(k);
    if(!item) return undefined;
    if(Date.now()-item.at>this.ttlMs){this.items.delete(k);return undefined;}
    item.hits++; item.at=Date.now();
    this.items.delete(k);
    this.items.set(k,item);
    return item.value;
  }
  set(context,value){
    if(this.maxEntries===0) return this.key(context);
    const k=this.key(context);
    if(this.items.has(k)) this.items.delete(k);
    else if(this.items.size>=this.maxEntries) this.items.delete(this.items.keys().next().value);
    this.items.set(k,{value,hits:0,at:Date.now()});
    return k;
  }
  clear(){this.items.clear();}
  stats(){return {entries:this.items.size,maxEntries:this.maxEntries,ttlMs:this.ttlMs};}
}

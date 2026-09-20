export class IdempotencyStore {
  constructor(){this.values=new Map();}
  has(key){return this.values.has(String(key));}
  set(key,value=true){this.values.set(String(key),value);return value;}
  get(key){return this.values.get(String(key));}
  clear(){this.values.clear();}
}
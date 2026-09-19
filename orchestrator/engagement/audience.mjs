export class AudienceEngine {
  constructor(){this.contacts=new Map();this.segments=new Map();}
  upsert(contact){const id=String(contact.id);this.contacts.set(id,{...this.contacts.get(id),...contact,id});return this.contacts.get(id);}
  import(contacts=[]){for(const c of contacts)this.upsert(c);return contacts.length;}
  define(id,predicate,meta={}){if(typeof predicate!=="function")throw new TypeError("predicate must be a function");this.segments.set(String(id),{id:String(id),predicate,meta});return this.segments.get(String(id));}
  evaluate(id){const s=this.segments.get(String(id));if(!s)throw new Error("SEGMENT_NOT_FOUND");return [...this.contacts.values()].filter(c=>s.predicate(c));}
  tags(id,required=[]){return this.evaluate(id).filter(c=>required.every(t=>(c.tags??[]).includes(t)));}
}
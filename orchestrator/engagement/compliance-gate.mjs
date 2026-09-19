export class ComplianceGate {
  constructor({requireOptIn=true}={}){this.requireOptIn=requireOptIn;this.contacts=new Map();}
  upsert(contact){const id=String(contact.id);this.contacts.set(id,{...this.contacts.get(id),...contact,id});return this.contacts.get(id);}
  optIn(id,categories=["marketing","utility","authentication"]){const c=this.upsert({id});c.optIn=new Set(categories);c.optedOut=new Set();return c;}
  optOut(id,categories=["marketing","utility","authentication"]){const c=this.upsert({id});c.optedOut=new Set(categories);return c;}
  canSend(contact,category="utility"){const c=this.contacts.get(String(contact.id))??contact;if(c.blocked||c.optedOut?.has?.(category))return {ok:false,code:"OPTED_OUT"};if(this.requireOptIn&&!c.optIn?.has?.(category))return {ok:false,code:"NO_OPT_IN"};return {ok:true};}
}
export class AuditLog {
  constructor(){this.entries=[];}
  record(action,actor,metadata={}){this.entries.push({at:new Date().toISOString(),action,actor,metadata});}
  query(filter={}){return this.entries.filter(e=>Object.entries(filter).every(([k,v])=>e[k]===v));}
  all(){return [...this.entries];}
}
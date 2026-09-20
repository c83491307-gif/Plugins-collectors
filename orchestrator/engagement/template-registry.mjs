export class TemplateRegistry {
  constructor(){this.items=new Map();}
  upsert(template){if(!template?.name)throw new TypeError("template.name is required");const t={status:"draft",variables:[],...template};this.items.set(t.name,t);return t;}
  approve(name,approval={source:"provider"}){const t=this.items.get(name);if(!t)throw new Error("TEMPLATE_NOT_FOUND");t.status="approved";t.approval=approval;return t;}
  get(name){return this.items.get(name);}
  render(name,variables={}){const t=this.get(name);if(!t)throw new Error("TEMPLATE_NOT_FOUND");if(t.status!=="approved")throw new Error("TEMPLATE_NOT_APPROVED");return String(t.body??"").replace(/{{\s*([\w.-]+)\s*}}/g,(_,k)=>String(variables[k]??"")); }
  list(){return [...this.items.values()];}
}
export class LeadScoring {
  score(contact,{rules=[]}={}){return rules.reduce((sum,rule)=>sum+(rule.when?.(contact)?Number(rule.points??0):0),0);}
  rank(contacts,options={}){return contacts.map(c=>({...c,score:this.score(c,options)})).sort((a,b)=>b.score-a.score);}
}
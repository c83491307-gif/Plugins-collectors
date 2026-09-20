export class EngagementAnalytics {
  constructor(){this.events=[];}
  track(type,payload={}){this.events.push({at:Date.now(),type,...payload});}
  summarize(campaignId){const e=this.events.filter(x=>x.campaignId===campaignId);const count=t=>e.filter(x=>x.type===t).length;const sent=count("sent"),delivered=count("delivered"),read=count("read"),replied=count("replied"),failed=count("failed");return {campaignId,sent,delivered,read,replied,failed,deliveryRate:sent?delivered/sent:0,readRate:delivered?read/delivered:0,replyRate:delivered?replied/delivered:0};}
}
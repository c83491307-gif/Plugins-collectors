export class DeliveryGovernor {
  constructor({perMinute=60,quietHours=[]}={}){this.perMinute=Math.max(1,perMinute);this.quietHours=quietHours;this.timestamps=[];}
  allowedAt(date=new Date()){const h=date.getHours();return !this.quietHours.some(([from,to])=>from<=to?h>=from&&h<to:h>=from||h<to);}
  acquire(date=new Date()){if(!this.allowedAt(date))return {ok:false,code:"QUIET_HOURS"};const now=date.getTime();this.timestamps=this.timestamps.filter(t=>now-t<60_000);if(this.timestamps.length>=this.perMinute)return {ok:false,code:"RATE_LIMIT"};this.timestamps.push(now);return {ok:true};}
}
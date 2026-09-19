export class AutomationEngine {
  constructor({events}={}){this.events=events;this.flows=new Map();}
  register(flow){if(!flow?.id||!Array.isArray(flow.steps))throw new TypeError("flow requires id and steps");this.flows.set(flow.id,flow);return flow;}
  async run(id,context={},handlers={}){const flow=this.flows.get(id);if(!flow)throw new Error("FLOW_NOT_FOUND");let state={...context};for(const step of flow.steps){if(step.when&&!step.when(state))continue;const fn=handlers[step.action];if(typeof fn!=="function")throw new Error("ACTION_HANDLER_MISSING:"+step.action);state=await fn(state,step);this.events?.emit("automation.step",{flowId:id,action:step.action});}return state;}
}
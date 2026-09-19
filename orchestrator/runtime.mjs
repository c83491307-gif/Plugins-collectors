import {ModelRegistry} from "./core/registry.mjs";
import {CapabilityRouter} from "./core/router.mjs";
import {RoutingPolicy} from "./core/policy.mjs";
import {CircuitBreaker} from "./core/circuit-breaker.mjs";
import {UsageLedger} from "./core/usage-ledger.mjs";
import {AgentGraph} from "./core/agent-graph.mjs";
import {MCPGateway} from "./mcp/gateway.mjs";
import {MCPAggregator} from "./mcp/aggregator.mjs";
import {MCPLifecycle} from "./mcp/lifecycle.mjs";
import {PluginRegistry} from "./plugins/registry.mjs";
import {SkillLoader} from "./skills/loader.mjs";
import {CredentialPool} from "./credentials/key-pool.mjs";
import {Planner} from "./agents/planner.mjs";
import {ConnectionManager} from "./auth/connection-manager.mjs";
import {AdaptiveScheduler} from "./core/adaptive-scheduler.mjs";
import {ContextCache} from "./core/context-cache.mjs";
export function createRuntime(config={}){
 const registry=new ModelRegistry(); const policy=new RoutingPolicy(config.routing); const router=new CapabilityRouter(registry); router.policy=policy;
 const runtime={registry,policy,router,usage:new UsageLedger(),graph:new AgentGraph(config.graph),mcp:new MCPGateway(),plugins:new PluginRegistry(),skills:new SkillLoader(),credentials:new CredentialPool()};
 runtime.connections=(config.masterKey??process.env.APP_MASTER_KEY)?new ConnectionManager({masterKey:config.masterKey??process.env.APP_MASTER_KEY}):null;
 runtime.circuitBreaker=new CircuitBreaker(config.circuitBreaker);
 router.circuitBreaker=runtime.circuitBreaker;
 runtime.contextCache=new ContextCache(config.cache);
 runtime.scheduler=new AdaptiveScheduler({registry,policy,circuitBreaker:runtime.circuitBreaker});
 runtime.mcpLifecycle=new MCPLifecycle(runtime.mcp); runtime.mcpAggregator=new MCPAggregator(runtime.mcp); runtime.planner=new Planner(runtime.router);
 return runtime;
}
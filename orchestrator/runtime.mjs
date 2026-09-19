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
export function createRuntime(config={}){
 const registry=new ModelRegistry(); const policy=new RoutingPolicy(config.routing); const router=new CapabilityRouter(registry); router.policy=policy;
 const runtime={registry,policy,router,circuitBreaker:new CircuitBreaker(config.circuitBreaker),usage:new UsageLedger(),graph:new AgentGraph(config.graph),mcp:new MCPGateway(),plugins:new PluginRegistry(),skills:new SkillLoader(),credentials:new CredentialPool()};
 runtime.mcpLifecycle=new MCPLifecycle(runtime.mcp); runtime.mcpAggregator=new MCPAggregator(runtime.mcp); runtime.planner=new Planner(runtime.router);
 return runtime;
}
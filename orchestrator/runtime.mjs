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
import {ProviderRuntime} from "./core/provider-runtime.mjs";
import {EventBus} from "./observability/events.mjs";
import {ComplianceGate} from "./engagement/compliance-gate.mjs";
import {AudienceEngine} from "./engagement/audience.mjs";
import {TemplateRegistry} from "./engagement/template-registry.mjs";
import {CampaignEngine} from "./engagement/campaign-engine.mjs";
import {AutomationEngine} from "./engagement/automation-engine.mjs";
import {EngagementAnalytics} from "./engagement/analytics.mjs";
import {OmnichannelRouter} from "./engagement/omnichannel-router.mjs";
import {AuditLog} from "./engagement/audit-log.mjs";
import {DeliveryGovernor} from "./engagement/delivery-governor.mjs";
import {ExperimentEngine} from "./engagement/experiment-engine.mjs";
import {LeadScoring} from "./engagement/lead-scoring.mjs";
import {IdempotencyStore} from "./engagement/idempotency.mjs";
import {InboxEngine} from "./engagement/inbox-engine.mjs";
import {FrequencyCap} from "./engagement/frequency-cap.mjs";
import {CampaignPlanner} from "./engagement/campaign-planner.mjs";
import {RevenueAttribution} from "./engagement/revenue-attribution.mjs";
import {SmartSendTime} from "./engagement/smart-send.mjs";
import {AutomationGraph} from "./engagement/automation-graph.mjs";
import {WebhookGateway} from "./integrations/webhook-gateway.mjs";
import {ConnectorRegistry} from "./integrations/connector-registry.mjs";
import {TenantRBAC} from "./security/tenant-rbac.mjs";
import {SecretVault} from "./security/secret-vault.mjs";
import {BudgetManager} from "./security/budget-manager.mjs";
import {DurableQueue} from "./queue/durable-queue.mjs";
import {ProviderHealth} from "./observability/provider-health.mjs";
import {KnowledgeBase} from "./ai/knowledge-base.mjs";
import {IntentRouter} from "./ai/intent-router.mjs";
import {ModelRouter} from "./ai/model-router.mjs";
import {BackupManager} from "./storage/backup-manager.mjs";
import {CEPX} from "./cepx/index.mjs";
import {CEPXPostgresStore} from "./cepx/postgres-store.mjs";
import {CEPXEnterprise} from "./cepx/enterprise.mjs";

export function createRuntime(config={}){
 const registry=new ModelRegistry(); const policy=new RoutingPolicy(config.routing); const router=new CapabilityRouter(registry); router.policy=policy;
 const events=new EventBus(), audience=new AudienceEngine(), compliance=new ComplianceGate(config.compliance), templates=new TemplateRegistry();
 const runtime={registry,policy,router,usage:new UsageLedger(),graph:new AgentGraph(config.graph),mcp:new MCPGateway(),plugins:new PluginRegistry(),skills:new SkillLoader(),credentials:new CredentialPool(),events,audience,compliance,templates,audit:new AuditLog()};
 runtime.connections=(config.masterKey??process.env.APP_MASTER_KEY)?new ConnectionManager({masterKey:config.masterKey??process.env.APP_MASTER_KEY}):null;
 runtime.circuitBreaker=new CircuitBreaker(config.circuitBreaker); router.circuitBreaker=runtime.circuitBreaker;
 runtime.contextCache=new ContextCache(config.cache);
 runtime.providers=new ProviderRuntime({registry,connections:runtime.connections,usage:runtime.usage});
 runtime.scheduler=new AdaptiveScheduler({registry,policy,circuitBreaker:runtime.circuitBreaker});
 runtime.mcpLifecycle=new MCPLifecycle(runtime.mcp); runtime.mcpAggregator=new MCPAggregator(runtime.mcp); runtime.planner=new Planner(runtime.router);
 runtime.campaigns=new CampaignEngine({compliance,audience,templates,events}); runtime.automation=new AutomationEngine({events});
 runtime.analytics=new EngagementAnalytics(); runtime.channels=new OmnichannelRouter(); runtime.deliveryGovernor=new DeliveryGovernor(config.delivery);
 runtime.experiments=new ExperimentEngine(); runtime.leadScoring=new LeadScoring(); runtime.idempotency=new IdempotencyStore();
 runtime.inbox=new InboxEngine({events}); runtime.frequencyCap=new FrequencyCap(config.frequency); runtime.campaignPlanner=new CampaignPlanner({templates});
 runtime.revenue=new RevenueAttribution(); runtime.smartSend=new SmartSendTime(); runtime.automationGraph=new AutomationGraph({events});
 runtime.webhooks=new WebhookGateway({secret:config.webhookSecret??process.env.WEBHOOK_SECRET}); runtime.connectors=new ConnectorRegistry();
 runtime.rbac=new TenantRBAC(); runtime.secrets=new SecretVault({masterKey:config.masterKey??process.env.APP_MASTER_KEY}); runtime.budgets=new BudgetManager(); runtime.queue=new DurableQueue(config.queue);
 runtime.providerHealth=new ProviderHealth(config.providerHealth); runtime.knowledgeBase=new KnowledgeBase(); runtime.intent=new IntentRouter(); runtime.models=new ModelRouter(); runtime.backups=new BackupManager();
 const cePxConfig=config.cepx??{};
 const cePxStore=cePxConfig.store??(cePxConfig.pool?new CEPXPostgresStore({pool:cePxConfig.pool,namespace:cePxConfig.namespace,lockKey:cePxConfig.lockKey}):null);
 if(cePxConfig.backend==="postgres"&&!cePxStore)throw Error("CEPX_POSTGRES_POOL_REQUIRED: use createRuntimeAsync or pass cePx.pool");
 runtime.cepx=new CEPX({file:cePxConfig.file??process.env.CEPX_STATE_FILE??"./data/cepx/projects.json",store:cePxStore});
 runtime.cepx.enterprise=new CEPXEnterprise(runtime.cepx,{masterKey:config.masterKey??process.env.CEPX_MASTER_KEY??process.env.APP_MASTER_KEY});
 events.on("campaign.sent",e=>runtime.analytics.track?.("sent",e)); events.on("campaign.delivered",e=>runtime.analytics.track?.("delivered",e)); events.on("campaign.read",e=>runtime.analytics.track?.("read",e)); events.on("campaign.replied",e=>runtime.analytics.track?.("replied",e));
 return runtime;
}


/**
 * Async runtime factory for DATABASE_URL / CEPX_DATABASE_URL deployments.
 * The synchronous createRuntime() remains backward-compatible and JSON-first.
 */
export async function createRuntimeAsync(config={}){
 const cePxConfig=config.cepx??{};
 if(cePxConfig.backend!=="postgres"&&!cePxConfig.databaseUrl&&!process.env.CEPX_DATABASE_URL)return createRuntime(config);
 const databaseUrl=cePxConfig.databaseUrl??process.env.CEPX_DATABASE_URL;
 if(!databaseUrl&&!cePxConfig.pool)throw Error("CEPX_DATABASE_URL_REQUIRED");
 const {Pool}=await import("pg");
 const pool=cePxConfig.pool??new Pool({connectionString:databaseUrl,max:cePxConfig.maxConnections??10,connectionTimeoutMillis:cePxConfig.connectionTimeoutMillis??5000});
 const runtime=createRuntime({...config,cepx:{...cePxConfig,backend:"postgres",pool}});
 try{await runtime.cepx.ready();}
 catch(error){if(!cePxConfig.pool)await pool.end().catch(()=>{});throw error;}
 runtime.close=async()=>{await runtime.cepx.close();};
 return runtime;
}

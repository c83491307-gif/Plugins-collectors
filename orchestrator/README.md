# Universal AI Orchestrator Foundation

Phase 2 extends the original foundation with policy routing, circuit breaking, usage accounting, dependency-aware multi-agent execution, MCP aggregation and an event bus.

Current research was performed against public GitHub repositories before implementation.

Reference projects studied:
- agentgateway/agentgateway — LLM/MCP/A2A gateway, failover, policy and observability.
- DojoGenesis/gateway — provider registry, DAG orchestration, memory/skills, events and MCP.
- ixqSCpxi/mcp-agent — MCP lifecycle, routing, parallel fan-out/fan-in, evaluator/optimizer and orchestrator-workers.
- ramsred/agentic-platform-mcp — multi-server MCP host, policy gating and observability.

The implementation in this repository is original; upstream source code is not vendored.

Next phases:
1. Real provider adapters and API discovery.
2. Secure credential/session vault and quota rotation.
3. File/media pipeline.
4. Persistent MCP connection lifecycle.
5. Chats and memory.
6. Plugin/skill loader.
7. Multi-agent planner/reviewer.
8. UI and end-to-end validation.

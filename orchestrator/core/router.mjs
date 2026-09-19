export class CapabilityRouter {
  constructor(registry) { this.registry = registry; }

  rank(request) {
    return this.registry.models
      .filter(m => m.enabled !== false)
      .filter(m => (request.capabilities ?? []).every(c => (m.capabilities ?? []).includes(c)))
      .filter(m => m.health?.state !== "down" && m.health?.state !== "quota_exhausted")
      .sort((a,b) =>
        ((b.health?.score ?? 0) - (a.health?.score ?? 0)) ||
        ((b.priority ?? 0) - (a.priority ?? 0))
      );
  }

  async execute(request, invoke) {
    const candidates = this.rank(request);
    if (!candidates.length) throw new Error("NO_CAPABLE_PROVIDER");
    const failures = [];
    for (const model of candidates.slice(0, request.maxAttempts ?? 4)) {
      try {
        const started = Date.now();
        const result = await invoke(model, request);
        model.health = {state:"healthy", score:Math.min(100,(model.health?.score ?? 80)+5), latencyMs:Date.now()-started};
        return {model:model.id, result, attempts:failures.length+1};
      } catch (error) {
        const code = error.code || "MODEL_ERROR";
        failures.push({model:model.id, code, message:String(error.message || error)});
        if (["AUTH_ERROR","QUOTA_EXHAUSTED","PROVIDER_DOWN"].includes(code))
          model.health = {state: code === "QUOTA_EXHAUSTED" ? "quota_exhausted" : "down", score:0};
      }
    }
    const e = new Error("ALL_MODELS_FAILED"); e.code="ALL_MODELS_FAILED"; e.failures=failures; throw e;
  }
}

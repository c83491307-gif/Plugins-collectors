import { ModelRegistry } from '../orchestrator/core/registry.mjs';
import { CapabilityRouter } from '../orchestrator/core/router.mjs';
import { RoutingPolicy } from '../orchestrator/core/policy.mjs';
import { UsageLedger } from '../orchestrator/core/usage-ledger.mjs';
import { ProviderRuntime } from '../orchestrator/core/provider-runtime.mjs';
import { ConnectionManager } from '../orchestrator/auth/connection-manager.mjs';

const PROVIDERS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    prefix: 'DEEPSEEK_API_KEY',
    capabilities: ['chat', 'code', 'reasoning'],
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    prefix: 'OPENAI_API_KEY',
    capabilities: ['chat', 'code', 'vision', 'tool_calling'],
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    prefix: 'NVIDIA_API_KEY',
    capabilities: ['chat', 'code', 'vision'],
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    prefix: 'XAI_API_KEY',
    capabilities: ['chat', 'code', 'vision'],
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    prefix: 'GOOGLE_API_KEY',
    capabilities: ['chat', 'code', 'vision'],
  },
};

class EphemeralConnectionManager {
  constructor(accounts) {
    this.items = new Map(accounts.map((account) => [account.id, {
      ...account,
      status: 'available',
      lastUsedAt: 0,
      fails: 0,
      until: 0,
    }]));
  }

  list(provider) {
    return [...this.items.values()]
      .filter((item) => !provider || item.provider === provider)
      .map(({ secret, ...item }) => ({ ...item, secret: 'cloudflare-secret' }));
  }

  lease(provider) {
    const available = [...this.items.values()]
      .filter((item) => item.provider === provider && item.status === 'available' && item.until <= Date.now())
      .sort((a, b) => (a.until - b.until) || (a.lastUsedAt - b.lastUsedAt));

    if (!available.length) {
      throw Object.assign(new Error('NO_AVAILABLE_CONNECTION'), { code: 'NO_CREDENTIAL' });
    }

    const item = available[0];
    item.lastUsedAt = Date.now();
    return {
      id: item.id,
      secret: item.secret,
      report: (ok, code) => this.report(item.id, ok, code),
    };
  }

  report(id, ok, code) {
    const item = this.items.get(id);
    if (!item) return;
    if (ok) {
      item.status = 'available';
      item.fails = 0;
      item.until = 0;
      return;
    }
    item.fails += 1;
    if (code === 'AUTH_ERROR' || code === 401 || code === 'insufficient_quota') {
      item.status = 'disabled';
      return;
    }
    item.status = 'cooling';
    item.until = Date.now() + Math.min(300000, 1000 * 2 ** Math.min(item.fails, 8));
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

function errorResponse(error) {
  const code = error?.code || 'ERROR';
  const status = code === 'RATE_LIMIT' ? 429
    : code === 'UNAUTHORIZED' ? 401
      : code === 'INVALID_CREDENTIAL' ? 400
        : code === 'NO_AVAILABLE_CONNECTION' ? 503
          : code === 'NO_CAPABLE_PROVIDER' ? 503
            : code === 'ALL_MODELS_FAILED' ? 502
              : code === 'CONFIGURATION_ERROR' ? 500
                : 500;
  return json({ error: { message: String(error?.message || error), code } }, status);
}

function getSecretNames(env, prefix) {
  const names = [prefix];
  for (let index = 2; index <= 10; index += 1) names.push(`${prefix}_${index}`);
  return names;
}

function collectAccounts(env) {
  const accounts = [];
  for (const [provider, definition] of Object.entries(PROVIDERS)) {
    let count = 0;
    for (const name of getSecretNames(env, definition.prefix)) {
      const secret = env[name];
      if (!secret || typeof secret !== 'string' || !secret.trim()) continue;
      count += 1;
      accounts.push({
        id: `${provider}-${count}`,
        provider,
        label: name,
        accountId: `${provider}-${count}`,
        secret: secret.trim(),
      });
    }
  }
  return accounts.slice(0, 100);
}

function createRuntime(env, requestAccounts = []) {
  const registry = new ModelRegistry();
  const policy = new RoutingPolicy();
  const router = new CapabilityRouter(registry);
  router.policy = policy;

  const accounts = [...collectAccounts(env), ...requestAccounts];
  const connections = env.APP_MASTER_KEY
    ? new ConnectionManager({ masterKey: env.APP_MASTER_KEY })
    : new EphemeralConnectionManager(accounts);

  if (env.APP_MASTER_KEY) {
    for (const account of accounts) {
      try {
        connections.add(account);
      } catch (error) {
        if (!['PROVIDER_ACCOUNT_CAPACITY_REACHED', 'ACCOUNT_CAPACITY_REACHED'].includes(error?.code)) throw error;
      }
    }
  }

  const usage = new UsageLedger();
  const providers = new ProviderRuntime({ registry, connections, usage });
  for (const [provider, definition] of Object.entries(PROVIDERS)) {
    providers.configure(provider, definition);
  }
  return { registry, router, connections, providers, usage };
}

async function syncConfiguredProviders(runtime, requestedProvider = null) {
  const providers = requestedProvider ? [requestedProvider] : Object.keys(PROVIDERS);
  const results = [];
  for (const provider of providers) {
    if (!PROVIDERS[provider]) throw Object.assign(new Error('UNKNOWN_PROVIDER'), { code: 'UNKNOWN_PROVIDER' });
    if (!runtime.connections.list(provider).length) continue;
    try {
      const models = await runtime.providers.syncProvider(provider);
      results.push({ provider, models });
    } catch (error) {
      results.push({ provider, error: error.code || error.message });
    }
  }
  return results;
}

function assertApiToken(request, env, required = false) {
  if (!env.CREAZZY_API_TOKEN) {
    return required
      ? Object.assign(new Error('API_TOKEN_NOT_CONFIGURED'), { code: 'CONFIGURATION_ERROR' })
      : null;
  }
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (supplied !== env.CREAZZY_API_TOKEN) {
    return Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED' });
  }
  return null;
}

async function serveUiAsset(request, env) {
  const url = new URL(request.url);
  let pathname = url.pathname;
  if (pathname === '/ui' || pathname === '/ui/') pathname = '/index.html';
  else if (pathname.startsWith('/ui/')) pathname = pathname.slice(3);
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname || '/index.html';
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'Authorization, Content-Type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/healthz') {
        return json({ status: 'ok', runtime: 'cloudflare-workers', fullStack: true });
      }

      if (url.pathname === '/api/status' && request.method === 'GET') {
        const authError = assertApiToken(request, env);
        if (authError) return errorResponse(authError);
        const runtime = createRuntime(env);
        const sync = await syncConfiguredProviders(runtime);
        const configured = Object.entries(PROVIDERS).map(([provider, definition]) => ({
          provider,
          configured: runtime.connections.list(provider).length > 0,
          accounts: runtime.connections.list(provider).length,
          models: runtime.registry.models.filter((model) => model.provider === provider).map((model) => model.id),
          baseUrl: definition.baseUrl,
          capabilities: definition.capabilities,
        }));
        return json({
          status: 'ok',
          runtime: 'cloudflare-workers',
          fullStack: true,
          configuredProviders: configured.filter((x) => x.configured).length,
          totalAccounts: runtime.connections.list().length,
          totalModels: runtime.registry.models.length,
          providers: configured,
          sync: sync.map((x) => ({ provider: x.provider, count: x.models?.length ?? 0, error: x.error ?? null })),
        });
      }

      if (url.pathname === '/v1/models' && request.method === 'GET') {
        const authError = assertApiToken(request, env);
        if (authError) return errorResponse(authError);
        const runtime = createRuntime(env);
        await syncConfiguredProviders(runtime);
        return json({
          object: 'list',
          data: runtime.registry.models.map((model) => ({
            id: model.id,
            object: 'model',
            owned_by: model.provider,
          })),
        });
      }

      if (url.pathname === '/connections' && request.method === 'GET') {
        const authError = assertApiToken(request, env);
        if (authError) return errorResponse(authError);
        const runtime = createRuntime(env);
        return json({ connections: runtime.connections.list() });
      }

      const providerSync = url.pathname.match(/^\/providers\/([^/]+)\/sync$/);
      if (providerSync && request.method === 'POST') {
        const authError = assertApiToken(request, env, true);
        if (authError) return errorResponse(authError);
        const provider = decodeURIComponent(providerSync[1]);
        const runtime = createRuntime(env);
        const results = await syncConfiguredProviders(runtime, provider);
        const result = results[0];
        if (!result) return json({ error: { message: 'UNKNOWN_PROVIDER', code: 'UNKNOWN_PROVIDER' } }, 404);
        if (result.error) return json({ error: result.error, provider }, 502);
        return json({
          provider,
          models: result.models.map((model) => ({
            id: model.id,
            object: 'model',
            owned_by: model.provider,
          })),
          count: result.models.length,
        });
      }

      if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
        const authError = assertApiToken(request, env, true);
        if (authError) return errorResponse(authError);
        const payload = await request.json();
        const runtime = createRuntime(env);
        await syncConfiguredProviders(runtime);
        const result = await runtime.router.execute(payload, async (model) => runtime.providers.invoke(model, payload));
        return json(result.result);
      }

      if (url.pathname === '/connections/deepseek/start' && request.method === 'GET') {
        return json({
          provider: 'deepseek',
          authType: 'api_key',
          requiresUserSuppliedKey: true,
          instructionsUrl: 'https://platform.deepseek.com/api_keys',
          persistence: env.APP_MASTER_KEY ? 'ephemeral-encrypted' : 'cloudflare-secret-based',
        });
      }

      if (url.pathname === '/connections/deepseek/complete' && request.method === 'POST') {
        const authError = assertApiToken(request, env, true);
        if (authError) return errorResponse(authError);
        if (!env.APP_MASTER_KEY) {
          return errorResponse(Object.assign(
            new Error('APP_MASTER_KEY_REQUIRED_FOR_RUNTIME_CONNECTIONS'),
            { code: 'CONFIGURATION_ERROR' },
          ));
        }
        const payload = await request.json();
        const runtime = createRuntime(env, [{
          provider: 'deepseek',
          secret: payload.apiKey,
          label: payload.label || '',
          accountId: payload.accountId || '',
        }]);
        const connectionId = runtime.connections.add({
          provider: 'deepseek',
          secret: payload.apiKey,
          label: payload.label || '',
          accountId: payload.accountId || '',
        });
        const models = await runtime.providers.syncProvider('deepseek');
        return json({
          provider: 'deepseek',
          connectionId,
          models: models.map((model) => model.id),
        }, 201);
      }

      if (url.pathname === '/' || url.pathname.startsWith('/ui')) {
        return serveUiAsset(request, env);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return errorResponse(error);
    }
  },
};

import assert from 'node:assert/strict';
import worker from '../worker.mjs';

const env = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      return new Response(`asset:${url.pathname}`, {
        headers: { 'content-type': 'text/plain' },
      });
    },
  },
};

const health = await worker.fetch(new Request('https://example.test/healthz'), env);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: 'ok',
  runtime: 'cloudflare-workers',
  fullStack: true,
});

const models = await worker.fetch(new Request('https://example.test/v1/models'), env);
assert.equal(models.status, 200);
assert.deepEqual(await models.json(), { object: 'list', data: [] });

const ui = await worker.fetch(new Request('https://example.test/ui/app.js'), env);
assert.equal(ui.status, 200);
assert.equal(await ui.text(), 'asset:/app.js');

const root = await worker.fetch(new Request('https://example.test/'), env);
assert.equal(root.status, 200);
assert.equal(await root.text(), 'asset:/');

console.log('CLOUDFLARE WORKER SMOKE: PASS');

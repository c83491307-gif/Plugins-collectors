# MCP Aggregator Troubleshooting Note

## 1. Symptom

The connected-chain test failed under Node.js with a strict equality assertion showing:

`0 !== 1`

The failure occurred when resolving the qualified MCP tool name `mcp-test__lookup`. Earlier, an `assert.match()` failure was also observed because Node.js requires a RegExp argument; that assertion was corrected separately.

## 2. Root Cause

The MCP aggregator's `discover()` method constructed the qualified name and then spread the raw tool object after it:

```js
{
  name: server.name + "__" + tool.name,
  server: server.name,
  ...tool
}
```

If `tool` already contained its own `name` property, the later spread overwrote the qualified name. The discovered record therefore contained `lookup` instead of `mcp-test__lookup`, causing `resolve(["mcp-test__lookup"])` to return zero results.

The runtime wiring in `runtime.mjs` and `lifecycle.mjs` was not the cause of this failure.

## 3. Fix

Keep the raw tool properties first, then explicitly write the canonical qualified name and server:

```js
{
  ...tool,
  name: server.name + "__" + tool.name,
  server: server.name
}
```

This makes the canonical MCP identifier authoritative and prevents a spread operation from overwriting it.

## 4. Verification

Run:

```bash
cd ~/Plugins-collectors
git checkout feat/freetoken-inspired-runtime
git pull origin feat/freetoken-inspired-runtime
cd orchestrator
npm run smoke
```

The connected-chain stage must pass before proceeding to the later stages.

## 5. Guard Rail

Keep regression coverage for the qualified identifier:

```js
assert.equal(r.mcpAggregator.resolve(["mcp-test__lookup"]).length, 1);
```

Also retain coverage for the supported short forms when those are part of the public contract.

## 6. Lesson

In JavaScript object literals, property order matters when object spread is used. A later spread can overwrite explicitly declared properties. When an object needs canonical fields such as identifiers, provider names, or routing keys, spread source data first and assign authoritative fields afterward.

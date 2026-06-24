# Demo agent provider fixtures

The `dottie`, `riko`, and `gamma` profiles are optional local examples for how HTTP provider workers register and join raids. They are not part of the default Boss Raid dev stack.

Copy a template into `temp/` when you want to experiment locally:

```bash
mkdir -p temp/demo-agents
cp examples/providers/demo-agents.providers.http.json.example temp/demo-agents/providers.http.json
```

Then point your env at the copy:

```bash
BOSSRAID_PROVIDERS_FILE=./temp/demo-agents/providers.http.json
BOSSRAID_DEV_SPAWN_PROVIDERS=true
pnpm dev
```

Docker and EigenCompute variants:

- `demo-agents.providers.compose.json.example`
- `demo-agents.providers.eigencompute.json.example`

Game-raid and strict-private e2e fixtures under `examples/raids/game-raid/` and `examples/raids/strict-private/` remain test-only scenarios.

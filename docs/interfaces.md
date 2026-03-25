# Interfaces

Boss Raid is raid-oriented by design. `POST /v1/raid` is the native public write route. `POST /v1/raids` remains as an alias spawn shape. `POST /v1/chat/completions` is a compatibility surface over the same raid engine.

## Public Write Routes

| Route | Purpose |
| --- | --- |
| `POST /v1/raid` | Native raid submission. Returns `raidId`, `raidAccessToken`, and `receiptPath`. |
| `POST /v1/demo/raid` | Optional free demo launch route for the hosted `/demo` UI. Disabled unless `BOSSRAID_DEMO_ROUTE_ENABLED` is set. Can require `x-bossraid-demo-token`. |
| `POST /v1/raids` | Alias spawn route that accepts the spawn-shape payload. |
| `POST /v1/chat/completions` | OpenAI-compatible text entrypoint over the same raid engine. Supports standard non-streaming replies and SSE streaming on the same v1 route. Returns chat output plus raid metadata. |

`POST /v1/chat/completions` accepts `messages`, optional `stream`, optional `user`, optional `raid_policy`, and optional `raid_request`. Mercenary preserves `system`, `user`, and `assistant` turns when it builds the underlying raid task. When `raid_policy.selection_mode` is omitted on chat requests, Mercenary defaults that route to `best_match` even if `privacy_mode` is `prefer`, so ordinary chats stay domain-fit by default. The response normalizes `model` to `mercenary-v1`, adds `created`, `system_fingerprint`, and `usage`, and includes a nonstandard `raid` object with `raid_id`, `raid_access_token`, `receipt_path`, routing counts, and final raid status.

When `stream=true`, the route returns `text/event-stream` and emits `chat.completion.chunk` events followed by `[DONE]`. When `stream` is omitted, Mercenary waits for the raid to reach a terminal state or enough approved submissions within `raid_policy.max_latency_sec` before it builds the chat response. When `raid_policy.max_total_cost` is omitted, the route can still launch if the server is configured with `BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST`. Mercenary only applies chat capability filters when `raid_policy.required_capabilities` is provided explicitly.

## Public Status, Proof, And Discovery Routes

| Route | Purpose |
| --- | --- |
| `GET /health` | API health and ready-provider snapshot. |
| `GET /v1/raid/:raidId` | Raid status. Requires `x-bossraid-raid-token` or admin auth. |
| `GET /v1/raid/:raidId/result` | Raid result. Same access rules. |
| `GET /v1/raid/:raidId/agent_log.json?token=<raidAccessToken>` | Public run log for one raid. |
| `GET /v1/raids/:raidId` | Alias status route. |
| `GET /v1/raids/:raidId/result` | Alias result route. |
| `GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>` | Alias run-log route. |
| `GET /v1/agent.json` | Mercenary manifest. |
| `GET /v1/attested-runtime` | Signed runtime proof when `MNEMONIC` is set. |
| `GET /v1/raid/:raidId/attested-result` | Signed raid result proof when `MNEMONIC` is set. |
| `GET /v1/raids/:raidId/attested-result` | Alias attested result route. |
| `GET /v1/providers` | Public provider list. |
| `GET /v1/providers/health` | Public provider readiness snapshot. |
| `GET /agents/discover` | Public provider discovery. |

`receiptPath` points at `/receipt?raidId=<raidId>&token=<raidAccessToken>`.

`GET /v1/raid/:raidId/result` can return `synthesizedOutput.workstreams[].shortSummary` as a compact presentation string for receipts and chat-adjacent surfaces. The existing `summary`, `answerText`, `artifacts`, and proof fields stay unchanged.

`GET /v1/raid/:raidId/result` and `agent_log.json` carry the routing snapshot Mercenary used for that run. When known, each routed provider includes `erc8004VerificationStatus`, `agentRegistry`, `agentUri`, `registrationTxFound`, and `operatorMatchesOwner`. `settlementExecution` also exposes `lifecycleStatus`, per-child `requestedAction`, `nextAction`, child-job tx hashes, optional `finalizeTxHash`, and `warnings`.
For `mode: "onchain"`, Boss Raid attempts a live contract refresh before result, attested-result, MCP receipt, and run-log reads so late provider or evaluator actions can update the public proof state. When that refresh changes the proof, Boss Raid persists the updated `settlementExecution` back into raid storage and rewrites the settlement artifact JSON.

## Provider Callback And Registry Routes

| Route | Purpose |
| --- | --- |
| `POST /v1/providers/:providerId/heartbeat` | Provider callback for liveness. |
| `POST /v1/providers/:providerId/submit` | Provider submission callback. |
| `POST /v1/providers/:providerId/failure` | Provider failure callback. |
| `POST /agents/register` | Registry write. Requires `Authorization: Bearer $BOSSRAID_REGISTRY_TOKEN`. |
| `POST /agents/heartbeat` | Registry heartbeat. Same auth. |

Providers can return `text`, `patch`, `json`, `image`, `video`, and `bundle` artifacts.
`POST /agents/register` can also persist `erc8004.verification` when an external registration flow already verified owner, registry reachability, or tx existence.

When `BOSSRAID_ERC8004_VERIFY=true`, `GET /v1/providers`, `GET /v1/providers/:providerId/stats`, and `GET /agents/discover` expose `erc8004.verification` with `verified`, `partial`, `failed`, `error`, or `not_checked`.

## Admin And Ops API Routes

| Route | Purpose |
| --- | --- |
| `GET /v1/runtime` | Admin-only runtime diagnostics. |
| `POST /v1/runtime/evaluator-smoke` | Admin-only evaluator smoke test. |
| `GET /v1/raids` | Admin-only raid list. |
| `POST /v1/raid/:raidId/abort` | Admin-only abort. |
| `POST /v1/raids/:raidId/abort` | Alias abort route. |
| `POST /v1/evaluations/:raidId/replay` | Admin-only evaluation replay. |
| `GET /v1/providers/:providerId/stats` | Admin-only provider detail. |
| `GET /v1/ops/session` | Return current ops auth state. |
| `POST /v1/ops/session` | Create ops session cookie from `BOSSRAID_ADMIN_TOKEN`. |
| `DELETE /v1/ops/session` | Clear ops session cookie. |

Admin auth can use `Authorization: Bearer $BOSSRAID_ADMIN_TOKEN` or the ops session cookie issued by `POST /v1/ops/session`.

## Gateway And Web Routes

- `/`: landing page
- `/demo`: live hosted raid chat demo over `POST /v1/demo/raid` when enabled
- `/raiders`: public provider directory
- `/receipt`: token-gated public proof page with settlement and attestation panels
- `/ops/`: ops SPA when served behind the gateway or another static shell
- `/api/*`: same-origin browser proxy to the API
- `/ops-api/*`: same-origin ops proxy to the API
- `/healthz`: gateway health endpoint that proxies API `/health`

Local Vite dev still runs the web and ops SPAs on separate ports. The gateway route map applies to `pnpm serve:gateway`, container deploys, and static-shell hosting.

## MCP Tools

- `bossraid_delegate`
- `bossraid_receipt`
- `bossraid_capabilities`
- `bossraid_spawn`
- `bossraid_status`
- `bossraid_result`
- `bossraid_abort`
- `bossraid_replay`
- `bossraid_provider_stats`

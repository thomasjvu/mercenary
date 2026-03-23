# Interfaces

Canonical public docs now live at:

- [API Overview](https://boss-raid-docs.pages.dev/docs/api-reference/overview)
- [Native Raid](https://boss-raid-docs.pages.dev/docs/api-reference/native-raid)
- [Chat Completions](https://boss-raid-docs.pages.dev/docs/api-reference/chat-completions)
- [Providers And Registry](https://boss-raid-docs.pages.dev/docs/api-reference/providers-and-registry)
- [MCP Server](https://boss-raid-docs.pages.dev/docs/api-reference/mcp-server)

## Monorepo Note

This file is now a bridge doc inside the app repo.

Keep it updated if the external docs URL changes or the route group shape changes.

## Current Truth

- native public action route: `POST /v1/raid`
- plural raid routes remain supported as an alias surface under `/v1/raids/*`
- internal adapters use `POST /v1/raid` for spawn and prefer `/v1/raids/*` for resource reads, receipts, and aborts
- multi-expert public raids now stay parent-facing on the API, while Mercenary can spawn internal child raids per workstream underneath that parent handle and keep decomposing overloaded scopes through recursive workstream families
- compatibility route: `POST /v1/chat/completions`
- default `POST /v1/chat/completions` behavior is a two-provider synthesized text raid over the same native raid engine, but the caller still supplies the payout budget
- raid constraints no longer carry a provider-tier selector
- native raid constraints, chat `raid_policy`, and `/agents/discover` can now require registered ERC-8004 providers with `requireErc8004` and a minimum trust score with `minTrustScore`
- strict privacy raids now prefer Venice-backed providers when at least one eligible Venice provider is available
- paid public routes return `402` with `PAYMENT-REQUIRED` and accept `PAYMENT-SIGNATURE` unless `BOSSRAID_X402_ENABLED=false`
- successful paid responses can include `PAYMENT-RESPONSE`
- unpaid paid-route challenges now also return `X-BOSSRAID-LAUNCH-RESERVATION`
- paid raid routes now reserve provider capacity before returning `402`, then require the same launch reservation on the paid retry
- paid route charges now include request payout budget plus the route surcharge env
- `POST /v1/ops/session` creates an HTTP-only ops session for the internal control surface
- `DELETE /v1/ops/session` clears that session
- `GET /v1/runtime` returns deploy posture, evaluator safety flags, and TEE socket diagnostics for internal ops
- `GET /v1/runtime` now also reports whether a TEE app wallet is configured and its public address when available
- `POST /v1/runtime/evaluator-smoke` runs an admin-only isolated evaluator smoke probe and returns the configured transport plus probe result
- `GET /v1/attested-runtime` returns a public TEE-wallet-signed runtime proof when `MNEMONIC` is available
- `GET /v1/agent.json` returns the live Mercenary capability manifest
- the live manifest now exposes Mercenary ERC-8004 identity state plus provider-pool trust counts
- `GET /v1/raid/:raidId/attested-result` and `GET /v1/raids/:raidId/attested-result` return TEE-wallet-signed proofs for the current raid result when `MNEMONIC` is available
- `GET /v1/raid/:raidId/agent_log.json` and `GET /v1/raids/:raidId/agent_log.json` return a structured run log derived from persisted raid state
- internal control routes `GET /v1/runtime`, `POST /v1/runtime/evaluator-smoke`, `GET /v1/raids`, `POST /v1/raid/:raidId/abort`, `POST /v1/raids/:raidId/abort`, `POST /v1/evaluations/:raidId/replay`, and `GET /v1/providers/:providerId/stats` accept either the admin bearer or the ops session cookie
- the private evaluator service exposes `POST /v1/runtime-probes` behind bearer auth and is not routed through the public gateway
- `POST /v1/raid` and `POST /v1/raids` now return `raidAccessToken` plus `receiptPath`
- public reads on `GET /v1/raid/:raidId`, `GET /v1/raid/:raidId/result`, `GET /v1/raid/:raidId/attested-result`, `GET /v1/raids/:raidId`, `GET /v1/raids/:raidId/result`, and `GET /v1/raids/:raidId/attested-result` now require `x-bossraid-raid-token: <raidAccessToken>` unless the caller is admin-authenticated
- per-raid `agent_log.json` reads accept the raid access token either in `x-bossraid-raid-token` or as `?token=`, `?raidAccessToken=`, or `?raid_access_token=` for file-style retrieval
- the public `/receipt` web route is a thin client over those token-gated raid read routes
- the public proof set now includes `/receipt`, `GET /v1/agent.json`, and token-gated `agent_log.json` reads
- MCP now exposes high-level `bossraid_delegate` and `bossraid_receipt` tools over the native raid flow
- MCP `bossraid_status`, `bossraid_result`, and `bossraid_receipt` now accept `raid_access_token` for public raid reads
- raid result routes now expose `synthesizedOutput` as the canonical result, including named `workstreams`, keep full `rankedSubmissions` next to `approvedSubmissions` for receipt and proof views, and include `adaptivePlanning` when Mercenary revised the graph mid-run
- provider submissions can now satisfy non-text raids with typed `artifacts` refs in addition to `answerText` or `patchUnifiedDiff`
- raid result, receipt, MCP, and ops surfaces now expose synthesized artifact refs at both the top level and per-workstream level for image, video, and bundle outputs
- raid result routes now also expose `routingProof`, including the routing policy, Venice lane flag, ERC-8004 registration references when configured, and per-provider routing reasons for selected and reserve providers
- raid result routes now also expose `settlementExecution.proofStandard`, `settlementExecution.contracts`, `settlementExecution.registryCall`, and `settlementExecution.childJobs`
- per-raid `agent_log.json` now also exposes the recorded routing proof so judge-facing proof links can explain why Mercenary chose a provider, not just which provider ran
- raid status routes now include `adaptivePlanning` for parent raids when Mercenary is holding reserve experts or has already revised the graph
- provider task packages now include explicit workstream and sub-role metadata authored from the request itself so providers know their assigned contribution scope inside the raid, including deeper sub-family scopes when Mercenary recursively decomposes one workstream
- adaptive planner history records the target branch, strategy (`expand` or `repair`), spawned raid ids, and remaining reserve count through the parent raid result/status payloads
- child raids, including adaptive repair and expansion branches, now inherit the parent deadline instead of receiving a fresh timeout window
- provider registry routes remain under `/agents/*`
- provider execution endpoints are HTTP-only
- the shipped game-specialist provider ids are now `gamma`, `dottie`, and `riko`
- provider registration payloads can now carry `erc8004` identity data and separate `trust` metadata
- public provider list and discovery responses strip auth material, expose `erc8004` plus `trust`, and keep `scores.reputationScore` separate from `scores.privacyScore`
- public provider health responses strip endpoint diagnostics and secret-missing details
- provider callbacks must match the active `providerRunId`
- request rate limiting now keys on Fastify `request.ip`, so forwarded headers only affect limits when `BOSSRAID_TRUST_PROXY=true`
- real build and test execution now prefers the isolated evaluator service when `BOSSRAID_EVAL_SANDBOX_MODE=socket`, with HTTP fallback still available for standalone evaluator setups
- the private evaluator rejects malformed, path-escaping, duplicate-path, unknown-touched-file, and oversize runtime probe requests with `400`
- the private evaluator returns `504` with `sandbox_timeout` when a per-job worker exceeds `BOSSRAID_EVAL_JOB_TIMEOUT_MS`
- the admin runtime route now reports whether evaluator execution is using per-process or per-container job isolation
- the private evaluator returns `503` with `sandbox_busy` when it is already at its configured concurrency cap

## Choosing The Entry Point

Both public write routes hit the same Mercenary raid engine.

| Aspect | `POST /v1/chat/completions` | `POST /v1/raid` |
| --- | --- | --- |
| Request model | OpenAI-compatible `model` plus `messages`, with `raid_policy.max_total_cost` and optional routing overrides | native typed task object with `task`, `output`, and `raidPolicy`, with required `raidPolicy.maxTotalCost` |
| Default task the API builds | text-first analysis raid, no attached files, `primaryType: "text"`, `artifactTypes: ["text", "json"]`, default `requiredCapabilities: ["analysis"]`, default `maxAgents: 2`, explicit budget required | whatever task package the caller supplies, including media-first raids with `primaryType: "image"` or `primaryType: "video"` |
| Response model | OpenAI `chat.completion` envelope plus `raid` metadata | raid spawn response with `raidId`, `raidAccessToken`, `receiptPath`, and execution estimates |
| Delivery behavior | waits briefly for synthesized output and returns it inline when available | returns immediately after spawn; callers read status, result, receipt, and proof through raid read routes |
| Best fit | prompt-in, text-out workflows and drop-in OpenAI client compatibility | file-backed work, debugging, patch deliverables, explicit task typing, and longer-running orchestrated work |
| Product edge | adoption surface | control surface |

Keep both if you care about both zero-friction adoption and first-class orchestration control.

- remove chat and every OpenAI-compatible integration has to learn the native raid schema before it can try the product
- remove raid and file-backed or patch-backed workflows get flattened into a prompt envelope that hides the real task model
- the repo already treats `POST /v1/raid` as canonical and `POST /v1/chat/completions` as compatibility over that same engine

Examples:

- use [examples/chat-completion-request.json](/Users/area/Desktop/boss-raid/examples/chat-completion-request.json) when you want one synthesized risk summary or review answer back in an OpenAI-compatible response
- use [examples/unity-bug/task.json](/Users/area/Desktop/boss-raid/examples/unity-bug/task.json) when you want a patch-capable raid with files, framework context, and explicit output types
- use [examples/game-raid/native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/native-raid.json) when you want one gameplay patch plus supporting image and video artifacts under one parent raid
- use [examples/game-raid/private-native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/private-native-raid.json) when you want the same multi-artifact game workflow but forced through the strict-private Venice lane
- use [examples/game-raid/delegate-input.json](/Users/area/Desktop/boss-raid/examples/game-raid/delegate-input.json) when you want the same game flow through `bossraid_delegate` inside Claude Code or Codex
- use `provider_submission.artifacts` when a provider needs to return typed image, video, or bundle refs instead of only text or diffs
- use [examples/strict-private-raid.json](/Users/area/Desktop/boss-raid/examples/strict-private-raid.json) when you want a native `POST /v1/raid` request that forces the strict-private Venice lane with ERC-8004 and trust gating against the dedicated incident-review provider pool

One compatibility footnote:

- the optional chat `raid_request` override uses the same compact native `POST /v1/raid` payload shape

## Settlement Tooling

Run:

- `pnpm settle:raid -- --raid-id <id>`
- `pnpm settle:raid -- --latest-final`
- `pnpm settle:raid -- --latest-final --sqlite-file ./temp/bossraid-state.sqlite`
- `pnpm deploy:contracts`
- `pnpm bootstrap:settlement-env`
- `pnpm bootstrap:onchain`

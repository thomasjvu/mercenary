# End-to-End Testing

Use this document for the release rehearsal path.

Boss Raid should pass all release lanes before the hackathon demo:

- local Mercenary game raid with real artifact providers
- local Mercenary private game raid with Venice-only routing
- isolated evaluator smoke
- local HMAC smoke
- Base Sepolia with PayAI facilitator
- one tiny Base mainnet payment

## Prerequisites

- `pnpm install`
- `cp .env.example .env`
- `pnpm check`
- `pnpm build`
- `pnpm dev`
- set `BOSSRAID_MODEL_API_KEY` and `BOSSRAID_MODEL` so the generic local providers become ready
- for the game raid lane, set `VENICE_API_KEY_GAMMA`, `VENICE_API_KEY_RIKO`, and `VENICE_API_KEY_DOTTIE` instead

For the local demo lane, you can now use one command:

```bash
pnpm demo:rehearse
```

It runs `check`, `build`, API and orchestrator tests, boots the local stack, waits for API/web/ops readiness, then rehearses HMAC raid, chat, and MCP delegate flows.

The API must be running before `pnpm test:x402:e2e` or `pnpm test:mcp:e2e`.
The evaluator must be running before `pnpm test:evaluator:e2e`.

Public write routes are paid by default. For local private testing, set `BOSSRAID_X402_ENABLED=false`. For paid rehearsal, keep x402 on and set either the local HMAC verifier or the wallet-payment facilitator env below.

The command defaults to `POST /v1/raid`.

Use `--route chat` if you want to test `POST /v1/chat/completions` instead.

## Command

```bash
pnpm test:evaluator:e2e -- --help
pnpm test:x402:e2e -- --help
pnpm test:mcp:e2e -- --help
```

Supported options:

- `--sandbox-url <url>`
- `--sandbox-socket <path>`
- `--token <bearer-token>`
- `--mode hmac|wallet`
- `--route raid|chat`
- `--api-base <url>`
- `--payload-file <path>`

Default payloads:

- `examples/unity-bug/task.json` for `raid`
- `examples/chat-completion-request.json` for `chat`

## Lane 0: Local Game Raid Smoke

Use this to confirm Mercenary can plan, route, synthesize, and return one coherent multi-artifact result through the real Boss Raid HTTP provider path.

This command ignores the repo-wide `.env` default provider file and pins the game-raid provider pool unless you explicitly override `BOSSRAID_PROVIDERS_FILE`. It also chooses its own local API port and callback base unless you explicitly set `PORT`, `BOSSRAID_API_BASE`, or `BOSSRAID_CALLBACK_BASE`.

Run:

```bash
VENICE_API_KEY_GAMMA=... \
VENICE_API_KEY_RIKO=... \
VENICE_API_KEY_DOTTIE=... \
BOSSRAID_PROVIDERS_FILE=./examples/game-raid/providers.http.json \
pnpm test:game-raid:e2e
```

Expected result:

- the script builds the repo and boots the compiled API and provider set
- Mercenary posts one native game raid to `POST /v1/raid`
- the final result contains at least three workstreams
- the synthesized output contains patch, image, video, and bundle artifacts
- the final result exposes `routingProof`

## Lane 0b: Local Strict-Private Smoke

Use this to confirm Mercenary can force the Venice private lane, route only through ERC-8004-trusted providers, and expose the same proof in both the raid result and `agent_log.json`.

This command ignores the repo-wide `.env` default provider file and pins the strict-private provider pool unless you explicitly override `BOSSRAID_PROVIDERS_FILE`. It also chooses its own local API port and callback base unless you explicitly set `PORT`, `BOSSRAID_API_BASE`, or `BOSSRAID_CALLBACK_BASE`.

Run:

```bash
VENICE_API_KEY_GAMMA=... \
VENICE_API_KEY_RIKO=... \
VENICE_API_KEY_DOTTIE=... \
BOSSRAID_PROVIDERS_FILE=./examples/strict-private/providers.http.json \
pnpm test:strict-private:e2e
```

Expected result:

- the script builds the repo and boots the compiled API and provider set
- Mercenary posts [examples/strict-private-raid.json](/Users/area/Desktop/boss-raid/examples/strict-private-raid.json) to `POST /v1/raid`
- the final result contains a synthesized text answer
- `routingProof.policy.privacyMode` is `strict`
- `routingProof.policy.venicePrivateLane` is `true`
- the two primary routed providers are Venice-backed, ERC-8004-registered, and trust-scored `>= 80`
- `agent_log.json` exposes the same strict routing policy

## Lane 0c: Local Private Game Raid Smoke

Use this when you want the game demo itself to run inside the strict-private Venice lane instead of using the dedicated incident-review provider pool.

This command ignores the repo-wide `.env` default provider file and pins the game-raid provider pool unless you explicitly override `BOSSRAID_PROVIDERS_FILE`. It also chooses its own local API port and callback base unless you explicitly set `PORT`, `BOSSRAID_API_BASE`, or `BOSSRAID_CALLBACK_BASE`.

Run:

```bash
VENICE_API_KEY_GAMMA=... \
VENICE_API_KEY_RIKO=... \
VENICE_API_KEY_DOTTIE=... \
BOSSRAID_PROVIDERS_FILE=./examples/game-raid/providers.http.json \
pnpm test:private-game-raid:e2e
```

Expected result:

- the script builds the repo and boots the compiled API and game provider set
- Mercenary posts [examples/game-raid/private-native-raid.json](/Users/area/Desktop/boss-raid/examples/game-raid/private-native-raid.json) to `POST /v1/raid`
- the final result contains a gameplay patch plus image, video, and bundle artifacts
- `routingProof.policy.privacyMode` is `strict`
- `routingProof.policy.venicePrivateLane` is `true`
- the routed primary providers are Venice-backed, ERC-8004-registered, and trust-scored `>= 80`

## Lane 1: Isolated Evaluator Smoke

Use this to confirm real runtime probes execute inside the evaluator service instead of the API host.

Run one of:

```bash
pnpm dev:evaluator
pnpm test:evaluator:e2e
```

```bash
pnpm docker:up
docker compose exec -T api node scripts/test-evaluator-e2e.mjs
```

Expected result:

- the script prints a healthy evaluator payload
- the runtime probe response reports a passing `node --test` suite
- the API runtime diagnostic reports `"transport": "socket"` when the local or compose stack is using the default isolated socket path
- the evaluator health payload reports `"sandbox": "per_job_container"` in the shipped compose path

## Lane 2: Local HMAC Smoke

Use this to confirm the route contract and the retry flow without an onchain payment.

Set:

```bash
BOSSRAID_X402_VERIFY_HMAC_SECRET=local-dev-only
BOSSRAID_X402_PAY_TO=0x0000000000000000000000000000000000000001
```

Run:

```bash
pnpm dev
pnpm test:x402:e2e -- --mode hmac --route raid
pnpm test:mcp:e2e
```

Expected result:

- first request returns `402`
- `PAYMENT-REQUIRED` is present
- `X-BOSSRAID-LAUNCH-RESERVATION` is present
- paid retry returns `200`
- `PAYMENT-RESPONSE` is present
- the MCP delegate flow returns a `raidId` and later a receipt with a `primaryResponse`

## Lane 3: Base Sepolia With PayAI Facilitator

Use this for the real pre-release payment test.

Server env:

```bash
BOSSRAID_X402_NETWORK=eip155:84532
BOSSRAID_X402_ASSET=usdc
BOSSRAID_X402_PAY_TO=0x6170304BC32c790016085647C050194e7eEc447f
# Buyer charge = request budget + this surcharge.
BOSSRAID_X402_RAID_PRICE_USD=0.01
BOSSRAID_X402_CHAT_PRICE_USD=0.002
BOSSRAID_X402_RESOURCE_BASE_URL=http://127.0.0.1:8787
PAYAI_API_KEY_ID=your-payai-api-key-id
PAYAI_API_KEY_SECRET=your-payai-api-key-secret
```

Buyer env:

```bash
BOSSRAID_X402_BUYER_PRIVATE_KEY=0xyourbuyerprivatekey
```

`EVM_PRIVATE_KEY` also works if you already use that env name.

Fund the buyer wallet with:

- Base Sepolia ETH for gas
- Base Sepolia USDC for payment

Run:

```bash
pnpm dev
pnpm test:x402:e2e -- --mode wallet --route raid
pnpm test:x402:e2e -- --mode wallet --route chat
```

Expected result:

- the script prints a `challenge` object decoded from `PAYMENT-REQUIRED`
- the second request completes with `status: 200`
- the output includes a decoded `settlement`
- the API response body includes the raid result or `raidId`

## Lane 4: Base Mainnet Dress Rehearsal

Use one small real payment only after Base Sepolia is passing.

Change:

```bash
BOSSRAID_X402_NETWORK=eip155:8453
BOSSRAID_X402_PAY_TO=0x6170304BC32c790016085647C050194e7eEc447f
BOSSRAID_X402_RAID_PRICE_USD=0.01
BOSSRAID_X402_CHAT_PRICE_USD=0.01
```

Keep:

- `BOSSRAID_X402_ASSET=usdc`
- `PAYAI_API_KEY_ID`
- `PAYAI_API_KEY_SECRET`

Fund the buyer wallet with:

- Base ETH for gas
- Base USDC for payment

Run:

```bash
pnpm dev
pnpm test:x402:e2e -- --mode wallet --route raid
```

Confirm:

- the script reports `status: 200`
- `PAYMENT-RESPONSE` includes a real transaction id
- the receiving wallet balance changes as expected
- the raid appears in ops and `GET /v1/raids`

## Failure Cases

- `409` before `402`: no provider is eligible. Fix provider availability first.
- `402` after the paid retry: buyer payment creation or signing failed.
- `500` with facilitator error text: seller CDP auth or facilitator config failed.
- `500` with facilitator error text: seller PayAI/CDP auth or facilitator config failed.
- `200` without `PAYMENT-RESPONSE`: treat this as a release blocker.

## Optional CDP Path

CDP is still supported if you prefer it:

```bash
BOSSRAID_X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
CDP_API_KEY_ID=your-cdp-api-key-id
CDP_API_KEY_SECRET=your-cdp-api-key-secret
```

## Release Gate

Before the hackathon demo, run all of these:

- `pnpm test:game-raid:e2e`
- `pnpm test:evaluator:e2e`
- `pnpm demo:rehearse`
- `pnpm test:mcp:e2e`
- `pnpm test:x402:e2e -- --mode wallet --route raid`
- `pnpm test:x402:e2e -- --mode wallet --route chat`

## Final Launch Checklist

- choose the actual deploy target first: local gateway, Phala CVM, or EigenCompute
- set the seller payment wallet to `0x6170304BC32c790016085647C050194e7eEc447f`
- on EigenCompute, set `BOSSRAID_X402_RESOURCE_BASE_URL=https://<public-host>/api` before the public wallet lane
- set explicit provider ingress and callback auth for unattended deploys; do not ship `BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH=1`
- confirm provider workers are ready and their public `/health` output shows readiness only
- run `pnpm check`
- run `pnpm build`
- run `pnpm test:game-raid:e2e`
- run `pnpm demo:rehearse`
- run `pnpm eigencompute:build` if EigenCompute is the release target
- run `pnpm test:evaluator:e2e`
- run `pnpm test:mcp:e2e`
- run `pnpm test:x402:e2e -- --mode wallet --route raid`
- run `pnpm test:x402:e2e -- --mode wallet --route chat`
- run one tiny Base mainnet raid payment after Base Sepolia is green
- confirm the paid retry carries the launch reservation context and completes with `PAYMENT-RESPONSE`
- confirm the raid appears in ops, the public receipt opens, and provider health remains clean
- freeze the env file and image tags used for the passing rehearsal before the live demo

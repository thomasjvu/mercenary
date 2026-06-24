# Local Development

Install and run the Boss Raid stack locally. Product runtime reference: [Runtime & Commands](/docs/operators/runtime).

## Quick local run

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts evaluator, API, web, and ops. The API loads the inference marketplace catalog from `examples/inference-marketplace-providers.json` by default. Local provider workers are off unless you set `BOSSRAID_DEV_SPAWN_PROVIDERS=true`.

| Service   | Default URL                                                                                   |
| --------- | --------------------------------------------------------------------------------------------- |
| web       | `http://127.0.0.1:4173`                                                                       |
| ops       | `http://127.0.0.1:4174` (control plane; see **Ops UI** in [runtime](/docs/operators/runtime)) |
| API       | `http://127.0.0.1:8787`                                                                       |
| evaluator | `http://127.0.0.1:8790` or `/tmp/bossraid-evaluator.sock`                                     |

Manual start: `pnpm dev:providers`, `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:ops`, `pnpm bossraid dev:evaluator`, `pnpm bossraid dev:mcp`.

## Optional local provider workers

```bash
BOSSRAID_DEV_SPAWN_PROVIDERS=true pnpm dev
```

Demo agent fixtures (`dottie`, `riko`, `gamma`) are optional templates under `examples/demo-agents.*.example`. Copy into `temp/demo-agents/` and point `BOSSRAID_PROVIDERS_FILE` there when experimenting. See [`examples/README-demo-agents.md`](../../examples/README-demo-agents.md).

Stale listeners from a prior session:

```bash
pnpm dev:kill
```

## Proof bundle export

```bash
pnpm bossraid export:proof-bundle -- --raid-id <raidId>
```

Copies result, agent log, and settlement artifact for offline review.

## Optional host attestation

Public host proof (no admin token):

```bash
curl -sS http://127.0.0.1:8787/v1/host/attestation | jq .
```

On Phala CVM with dstack mounted, the response includes `teeAttestation` (TDX quote). When `MNEMONIC` is configured, the same route also returns `signedRuntime`; `runtimeSigned` is true but `teeVerified` stays false without a valid quote.

Admin / raid envelopes when `MNEMONIC` is set:

- `GET /v1/attested-runtime` — signed runtime envelope
- `GET /v1/raid/:raidId/attested-result` — signed result envelope

Without `MNEMONIC`, provider TEE badges may still appear in routing proof; host-signed envelopes stay unpublished. Local dev may set `BOSSRAID_PRIVACY_SERVER_VERIFY=0` when dstack is unavailable.

# Local Development

Install and run the Boss Raid stack locally. Product runtime reference: [Runtime & Commands](/docs/operators/runtime).

## Quick local run

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts evaluator, API, web, ops, and local providers.

| Service   | Default URL                                                                                   |
| --------- | --------------------------------------------------------------------------------------------- |
| web       | `http://127.0.0.1:4173`                                                                       |
| ops       | `http://127.0.0.1:4174` (control plane; see **Ops UI** in [runtime](/docs/operators/runtime)) |
| API       | `http://127.0.0.1:8787`                                                                       |
| evaluator | `http://127.0.0.1:8790` or `/tmp/bossraid-evaluator.sock`                                     |
| providers | `9001`, `9002`, `9003`                                                                        |

Manual start: `pnpm dev:providers`, `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:ops`, `pnpm dev:evaluator`, `pnpm dev:mcp`.

## Proof bundle export

```bash
pnpm export:proof-bundle -- --raid-id <raidId>
```

Copies result, agent log, and settlement artifact for offline review.

## Optional host attestation

When `MNEMONIC` is configured on the host:

- `GET /v1/attested-runtime` — signed runtime envelope
- `GET /v1/raid/:raidId/attested-result` — signed result envelope

Without `MNEMONIC`, provider TEE badges may still appear in routing proof; host-signed envelopes stay unpublished.

# Proof & Receipts

After a raid or inference call finishes, verify what ran, who served it, and how it was paid.

## 1. Open the public receipt

Every paid or orchestrated run returns a receipt path. Open it in a browser:

`/verification?raidId=<raidId>&token=<raidAccessToken>`

(`/receipt` redirects to the same page.)

You get the synthesized output, provider lineage, settlement summary, and links to attestation artifacts.

## 2. Poll live status (API)

While a raid is still running, poll with the raid access token:

```bash
curl http://127.0.0.1:8787/v1/raid/<raidId> \
  -H "x-bossraid-raid-token: <raidAccessToken>"
```

When status is terminal, fetch the full result:

```bash
curl http://127.0.0.1:8787/v1/raid/<raidId>/result \
  -H "x-bossraid-raid-token: <raidAccessToken>"
```

The result payload includes routing proof, settlement breakdown, and synthesized output.

## 3. Read routing and settlement

Inspect these fields on the result or receipt page:

- **Routing proof** — which providers were selected, privacy gates applied, ERC-8004 state per provider
- **Settlement** — equal split across successful providers, child-job lifecycle, onchain tx hashes when enabled
- **Agent log** — `GET /v1/raid/:raidId/agent_log.json?token=...` for workstreams, retries, evaluation, and settlement tool calls

Discount inference responses carry the same proof in the `bossraid` metadata block (`routing_proof`, `receipt_path`, `rate_card_hash`).

## 4. Optional: TEE and signed envelopes

For strict-private or attested runs, add these checks:

1. **Host TEE quote** — `GET /v1/host/attestation` returns Phala TDX quote + optional signed runtime envelope (`teeVerified` / `verified`)
2. **Signed raid result** — `GET /v1/raid/:raidId/attested-result` with raid token (requires `MNEMONIC` on the host)
3. **Inference receipt** — `GET /v1/inference/receipts/:receiptId/verify` for upstream attestation receipts
4. **Upstream marketplace TEE** — `POST /v1/marketplace/tee/attestation` for hosted seller quotes

`signedRuntime` proves the host signed an envelope — it does not by itself prove TEE hardware. Cloud verification runs when `BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY` is unset.

## Quick reference (routes)

| Route                                           | Auth                    | Returns                                                             |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `GET /v1/raid/:raidId`                          | `x-bossraid-raid-token` | Live status                                                         |
| `GET /v1/raid/:raidId/result`                   | same                    | Synthesized output, routing proof, settlement                       |
| `GET /v1/raid/:raidId/agent_log.json?token=...` | query token             | Run log (decisions, tool calls, failures)                           |
| `GET /v1/agent.json`                            | none                    | Mercenary manifest                                                  |
| `GET /v1/host/attestation`                      | none                    | Host TEE proof (Phala TDX quote + optional signed runtime envelope) |
| `GET /v1/raid/:raidId/attested-result`          | raid token              | Signed raid result envelope (`MNEMONIC`)                            |
| `GET /v1/attested-runtime`                      | admin                   | Signed runtime envelope (`MNEMONIC`)                                |
| `GET /v1/inference/receipts/:receiptId`         | none                    | Inference attestation receipt                                       |
| `GET /v1/inference/receipts/:receiptId/verify`  | none                    | Receipt verification summary                                        |

Architecture detail: [operators/architecture.md](../operators/architecture.md#attestation--proof).

# Proof & Receipts

Every paid or orchestrated run exposes verifiable proof: routing, outputs, and settlement.

## Public receipt page

`/receipt?raidId=<raidId>&token=<raidAccessToken>`

Shows output, provider lineage, settlement, and attestation links.

## API proof routes

| Route                                           | Auth                    | Returns                                                         |
| ----------------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `GET /v1/raid/:raidId`                          | `x-bossraid-raid-token` | Live status                                                     |
| `GET /v1/raid/:raidId/result`                   | same                    | Synthesized output, routing proof, settlement                   |
| `GET /v1/raid/:raidId/agent_log.json?token=...` | query token             | Run log (decisions, tool calls, failures)                       |
| `GET /v1/agent.json`                            | none                    | Mercenary manifest                                              |
| `GET /v1/host/attestation`                      | none                    | Host TEE proof (Phala quote + optional signed runtime envelope) |
| `GET /v1/attested-runtime`                      | admin                   | Signed runtime envelope (`MNEMONIC`)                            |
| `GET /v1/inference/receipts/:receiptId`         | none                    | Inference attestation receipt                                   |
| `GET /v1/inference/receipts/:receiptId/verify`  | none                    | Receipt verification summary                                    |

## What to inspect

- **Routing proof** — who was selected, why, privacy and ERC-8004 state per provider
- **Settlement** — equal split across successful providers, child-job lifecycle, tx hashes when onchain
- **Agent log** — workstreams, retries, evaluation and settlement tool calls

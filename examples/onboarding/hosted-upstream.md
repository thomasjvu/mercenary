# Hosted upstream onboarding

Use a wallet session from `/v1/auth/nonce` and `/v1/auth/verify`. The same flow supports all IDs in `UPSTREAM_PROVIDER_IDS`, including `nebius` and `openai`.

1. `POST /v1/seller/upstream/nebius/connect` with JSON `{ "apiKey": "<your API key>" }` and the session cookie. The server encrypts the key after account discovery and a completion probe.
2. `GET /v1/seller/upstream/nebius/models` with the same session. Select returned `modelId` values where `offerable` is true. Do not substitute raw upstream IDs or infer model names.
3. `POST /v1/seller/upstream/nebius/offers` with `{ "modelIds": ["<returned modelId>"], "discountPercent": 20, "lane": "chat" }`. Each selected model is rechecked and probed. Inspect both `providers` and `rejected`.
4. Confirm the model has an active seller in `GET /v1/markets?model_provider=nebius`. Buyers call `POST /v1/inference/chat/completions` using that public `modelId`.

Replace `nebius` with `openai` or another supported provider for the same flow. OpenAI uses native Responses internally. Catalog-only rows and live rows without prices cannot be published. TEE claims require attestation; imported metadata alone does not grant them. Probes consume tokens on the connected account.

For platform seats, configure `BOSSRAID_NEBIUS_API_KEY` / `BOSSRAID_OPENAI_API_KEY` and invoke `POST /v1/ops/platform-liquidity/bootstrap` with admin authentication. Inspect `published`, `skipped`, and `paused`. Catalog refresh and account activation are separate operations; see [runtime](../../content/docs/operators/runtime.md#catalog-refresh).

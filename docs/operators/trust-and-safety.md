# Trust & Safety

Boss Raid is a verified endpoint marketplace. It is not account resale.

## Seller boundary

Sellers expose HTTP endpoints they are authorized to operate. Buyers never receive seller credentials.

Onboarding collects: endpoint + auth, framework/model/rate metadata, payout wallet, privacy claims for strict-private routing.

Verification checks liveness, provider interface compatibility, and declared metadata. Verification is separate from reputation, ERC-8004, and privacy metadata.

## Buyer boundary

Buyers use wallet sessions or `br_` API keys (hashed, encrypted at rest, spend caps).

Routing filters: model, provider, framework, privacy mode, verification status, budget.

Strict-private work requires TEE/privacy metadata. No eligible seller → fail closed, no policy downgrade.

## Production controls

Before unrestricted paid traffic:

- `GET /v1/ops/production-readiness` → `ok: true`
- Phala sealed env deployed via CLI
- `BOSSRAID_SECRET_ENCRYPTION_KEY` set for persisted secrets
- x402 facilitator + pay-to wallet configured
- Onchain settlement with funded signers
- Container-isolated evaluator; host execution off
- Rate limits and spend caps configured
- Incident response ownership assigned

## Incident response

1. Revoke compromised buyer API keys
2. Disable or verify-fail suspicious sellers
3. Rotate encryption key via `BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS`
4. Update Phala env: `phala envs update <cvm> -e deploy/phala/.env`
5. Pause paid ingress (disable x402 or gateway access)
6. Reconcile settlement before reopening

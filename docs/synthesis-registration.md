# Synthesis Registration

Canonical public docs now live at:

- [Synthesis Registration](https://boss-raid-docs.pages.dev/docs/reference/synthesis-registration)

## Monorepo Note

This file is now a bridge doc inside the app repo.

## Current Truth

- registration is deferred
- keep the requirements in repo
- do not call registration until the build and submission story are ready
- current proof story now depends on real `routingProof` output, Venice strict-private routing, and ERC-8183 plus ERC-8004 evidence in the public receipt flow
- "ERC-8004 registry flow" here means the concrete registry deployment plus registration process you will use on Base for Mercenary and the demo providers
- this repo can consume real ERC-8004 registration references today, but it does not create those registrations onchain yet
- the recommended hackathon path is one consistent Base registry flow for Mercenary, one Venice-backed provider, and at least one comparison provider
- if Virtuals ACP is the chosen path, use ACP registration as the operational onboarding flow and consume the resulting ERC-8004 references inside Boss Raid
- ACP registration is not the runtime execution transport; Mercenary still calls Boss Raid HTTP providers registered in the provider registry unless a direct ACP bridge is added
- the field-by-field ACP to Boss Raid mapping lives in [docs/virtuals-acp-bossraid-mapping.md](/Users/area/Desktop/boss-raid/docs/virtuals-acp-bossraid-mapping.md)
- target tracks and proof requirements now live in [docs/synthesis-submission-plan.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-plan.md)
- draft Devfolio-ready copy now lives in [docs/synthesis-submission-copy.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-copy.md)
- the execution order and wallet role definitions live in [docs/synthesis-proof-runbook.md](/Users/area/Desktop/boss-raid/docs/synthesis-proof-runbook.md)

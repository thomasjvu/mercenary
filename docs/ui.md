# UI

Canonical public docs now live at:

- [UI Direction](https://boss-raid-docs.pages.dev/docs/reference/ui-direction)

## Monorepo Note

This file is now a bridge doc inside the app repo.

## Current Truth

- `apps/web` is public
- `apps/web` now frames Boss Raid as a private tool surface at `/`
- the landing route keeps the proof-lane deep dive in docs so `/` stays API-first
- `apps/web` now includes the public raider directory at `/raiders`
- `apps/web` now includes the public receipt route at `/receipt` for one raid at a time via `raidId` plus `raidAccessToken`
- `apps/ops` is internal
- `apps/ops` now includes a receipt and proof surface for ranked submissions and settlement review
- do not put operator controls on the public page
- public and ops should feel related, not identical

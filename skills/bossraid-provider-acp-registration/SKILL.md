---
name: bossraid-provider-acp-registration
description: Use when creating or updating Boss Raid specialist providers for Virtuals ACP and the Boss Raid provider registry. Covers the current golden-demo provider mapping, ACP agent wallet to Boss Raid provider-address mapping, local ACP offering scaffolds, required Boss Raid /agents/register metadata, and the safe publish sequence when fees and ERC-8004 references are not fully confirmed yet.
---

# Boss Raid Provider ACP Registration

Use this skill when a task involves:

- registering or updating a Boss Raid provider in Virtuals ACP
- syncing ACP agent wallets into Boss Raid provider-address maps
- preparing ACP offerings for the current golden demo workflow
- capturing or wiring ERC-8004 references into Boss Raid provider metadata

## Read First

- [docs/synthesis-registration.md](/Users/area/Desktop/boss-raid/docs/synthesis-registration.md)
- [docs/hackathon.md](/Users/area/Desktop/boss-raid/docs/hackathon.md)
- [examples/provider-registration.base-mainnet.example.json](/Users/area/Desktop/boss-raid/examples/provider-registration.base-mainnet.example.json)
- [references/provider-specializations.md](/Users/area/Desktop/boss-raid/skills/bossraid-provider-acp-registration/references/provider-specializations.md)

## Rules

- use the ACP agent wallet as the Boss Raid provider address
- do not use the ACP whitelisted dev wallet as the Boss Raid provider address
- keep privacy metadata and trust metadata separate
- do not run `acp sell create` until fee and business model are explicitly confirmed
- do not publish placeholder ERC-8004 transaction hashes
- remember that Boss Raid provider registration and ACP offering registration are separate steps

## Current Golden Demo Mapping

- `gamma` -> ACP display name `Gamma` -> `gbstudio_game_build`
- `riko` -> ACP display name `Riko` -> `remotion_video_scene`
- `dottie` -> ACP display name `Dottie` -> `pixel_art_asset_pack`
- `Mercenary` remains the orchestrator and is not a provider entry in `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON`

## Workflow

1. Confirm the ACP agents exist and identify their agent wallets.
2. Confirm the active ACP repo copy is [temp/openclaw-acp-work](/Users/area/Desktop/boss-raid/temp/openclaw-acp-work).
3. Edit the offering files under `src/seller/offerings/<agent>/<offering>/`.
4. If fees are still unknown, keep the offerings local-only and do not publish them.
5. Capture ERC-8004 references from the ACP UI or another official Virtuals surface.
6. Copy the agent wallet into the Boss Raid provider-address map.
7. Copy the ERC-8004 references into the Boss Raid provider registration JSON.
8. Register the provider endpoint in Boss Raid with `POST /agents/register`.

## ACP Constraints

- the OpenClaw ACP CLI can create agents and save wallets locally
- the CLI-created agents currently show `HYBRID` in profile output
- the CLI does not expose ERC-8004 agent id, registration tx, or registry addresses in `profile show`

That means role finalization and ERC-8004 capture still need an ACP UI pass.

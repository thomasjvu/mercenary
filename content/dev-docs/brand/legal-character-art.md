# Legal page Mercenary art

Legal policy pages (`/terms-of-service`, `/privacy-policy`, `/acceptable-use-policy`) render a floating Mercenary clip in the right column via `LegalCharacterLayer`. The asset is a transparent WebM loop keyed from white, with a single subtle CSS aura layer.

## Shipped asset

| File                                                   | Role                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `apps/web/src/assets/legal/mercenary-legal-float.webm` | Production loop (500px wide, VP9 + alpha, ~4.75s trim)          |
| `apps/web/src/styles/features/_legal.css`              | Size, opacity, aura, sticky column layout (hidden below 1080px) |

## OC references

Canonical stills live in `assets/oc-references/`. See [DESIGN-LOCK.md](../../assets/oc-references/DESIGN-LOCK.md).

| File                                       | Role                                              |
| ------------------------------------------ | ------------------------------------------------- |
| `boss-raid-pfp.png`                        | Primary head, visor, hex reactor lock             |
| `mercenary-mk0-hero-low.png`               | Full-body proportions                             |
| `s01-hero-frame.png`, `s06-hero-frame.png` | Motion/pose reads                                 |
| `copy-x-stance-ref.png`                    | Wide fighting stance reference (pose only)        |
| `legal-float-ref.png`                      | QA target — dual temple spikes + palm charge shot |

**S07 legal-float add-on:** localized cyan charge sphere at the extended palm. Canonical pfp and legal float both use symmetrical temple spike fins.

## Generation pipeline

Scene prompts: `.private/demo-video/prompts/scenes/S07_legal-float.md`

```bash
pnpm bossraid sync:oc-references
pnpm bossraid generate:legal-character   # Venice keyframe + 5s clip; writes webm
```

`generate:legal-character` runs `venice-legal-character.mjs --regen-image`, queues `wan-2-7-image-to-video` at 720p, then exports the shipped WebM. Re-export only from an existing MP4:

```bash
pnpm bossraid export:legal-character
```

Requires `VENICE_API_KEY` in `.private/.env` (not committed). Optional: `VENICE_VIDEO_MODEL` (default `wan-2-7-image-to-video`).

Keyframe chain: padded `boss-raid-pfp` → `s01-hero-frame` → `mercenary-mk0-hero-low` → `s06-hero-frame` via `gpt-image-2-edit`, with `qwen-edit` fallback.

## Visual targets

- Straight-on forward camera; hover power stance; arm thrust at viewer
- Matching temple spike fins on both sides of the helmet
- Bright cyan charge sphere at the extended palm (localized — not a full-body aura)
- Subtle hex reactor rim glow and boot thrusters only
- Seamless loop; first and last frames match

After regenerating, verify on `/terms-of-service` at ≥1080px viewport width.

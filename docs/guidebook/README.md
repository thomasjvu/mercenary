# Boss Raid instruction manual

Open `boss-raid-field-guide.html` directly in a browser. Everything needed to read
it is embedded: fonts, character cels, embroidery texture, icons, CSS and script.
No server, credentials or network connection is needed. The Mercenary and Docs
links navigate online only when selected. This guide does not launch paid work.

## Build and verify

From the repository root:

```sh
python3 docs/guidebook/build.py
python3 docs/guidebook/verify.py
```

The builder uses Python's standard library and reads only this directory. Edit
chapter content in `build.py`, layout in `style.css`, and motion in `motion.js`.
Rebuild the HTML after any source change. Generation is deterministic; no image
service is needed to rebuild. Verify with `agent-browser` and its installed Chrome
browser. The verifier uses an isolated `boss-guide-final` session, with socket files in
`/tmp/boss-guide-final-browser` unless `AGENT_BROWSER_SOCKET_DIR` is already set.

`evidence/verification.json` records assertions, viewport sizes and the HTML hash.
Screenshots cover 320, 390, 834, 1440 and 2560 px hero layouts, mobile and desktop
chapters, visor blinking, reduced motion and the footer. `RESULTS.md` records the
human review and repository checks. Rerunning verification replaces the evidence.

## Content and source of truth

Eight chapters: meet Mercenary, sign in, brief the mission, select eligible
providers, follow work, inspect receipts, post a bounty, and register a worker.
This is a work marketplace journey with game-inspired presentation. It does not
claim game progression, local chat storage, relationship mechanics or inference
selling. Failed work earns no payout; successful raid providers split equally.
Privacy policy and reputation are separate.

Reviewed implementation and matching product documentation:

- `apps/web/src/lib/app-routes.ts`: actual navigation and seller registration.
- `apps/web/src/pages/MercenaryPage.tsx`, `components/mercenary/`: hosted workspace.
- `apps/web/src/api/raid.ts`: token-based status/result retrieval.
- `apps/web/src/pages/ReceiptPage.tsx`: verification flow.
- `apps/web/src/pages/BountiesPage.tsx`: bounty marketplace and wallet escrow.
- `content/docs/buyers/buy.md`, `raiders/raids.md`, `sellers/sell.md`.
- `content/docs/overview/proof.md`, `reference/payments.md`.
- `DESIGN.md`, `content/dev-docs/brand/rx-78-design-system.md`.

The manual uses the RX white/ink/blue palette with yellow character effects.
BBH Bartle and the fixed character rail are intentional editorial adaptations
of the requested Rally manual format, scoped to this standalone artifact. Shared
product tokens and the application are unchanged. No eyebrow or corner wordmark.

## Artwork and motion

`assets/mercenary-{ready,dispatch,salute}.png` were made using built-in Codex
imagegen, referencing this project's `assets/oc-references/mercenary-mk0-front.png`.
The ready image is the reference for the other two poses. `art-prompts.json`
contains the final prompts. No Venice generation, character embroidery, shirt
logo overlay or Phantasy hand-holding cel is used. Character artwork © Phantasy LLC.

The illustrations are held poses, not a continuous rig. Gentle floating and
scroll parallax accompany dispatch poses. The robot's visor briefly dims as a
mechanical blink on desktop. The last chapter holds a raised-fist salute and a
yellow mission spark. Black pixels blend with the rail using `screen`, keeping
vertical lettering visible. Embroidery texture is used only inside icon masks.

Reduced motion disables all animations, transitions, parallax, speed lines and
visor blinking. Pose changes remain instantaneous; the closing spark is static.
There is no pause-motion button. Keyboard users have a skip link, visible focus,
anchor navigation and an accessible disclosure. Mobile retains a narrow fixed
character rail; the robot is intentionally cropped horizontally there.

## Reference provenance

Read-only design reference: `/Users/area/@rally/docs/guidebook/` (`build.py`, HTML,
CSS, motion, verifier, README and assets). No reference files were modified.
Locally bundled BBH Bartle, Maple Mono, the charcoal embroidery texture and base
SVG icon paths were copied from that guide. Fonts keep their original names.
Rally characters, logos and feature claims were not reused. The builder adds no
remote asset requests. Outbound URLs come from the Boss Raid repository's public
app and documentation references; this offline verification does not certify a
live deployment or perform real payments.

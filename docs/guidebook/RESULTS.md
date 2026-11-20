# Boss Raid manual — validation result

Verified November 20, 2026. The standalone HTML is complete and runs directly from
a local file with the browser offline. It contains eight chapters, three newly
illustrated Mercenary held poses, two embedded fonts and 24 stitched icons.

## Browser verification

`python3 docs/guidebook/verify.py` passes in Chrome through `agent-browser`.
The repeatable evidence is in `evidence/verification.json` and 16 PNG screenshots.
The JSON contains the exact HTML SHA-256 for this run.

- Viewports: 320 × 740, 390 × 844, 834 × 1112, 1440 × 1000, 2560 × 1440.
- No page or heading overflow at any viewport; all character assets and both
  fonts load offline; zero external asset references and browser errors.
- All eight chapter positions and active pose opacity checked.
- Keyboard Tab → skip link → Enter moves focus to chapter one. The About
  disclosure opens with Enter. Interactive controls have accessible names.
- Scroll parallax and speed-line response checked; desktop visor blink sampled.
- Reduced motion: zero animations, automatic scrolling, zero parallax, hidden
  speed lines, static closing spark. The mobile closing spark stays inside the rail.
- Fixed black character rail, screen blending, white RX content surface, no
  eyebrow labels, pause button or shirt-logo overlay.

## Visual review

Reviewed desktop hero and receipt chapter, tablet hero, mobile mission chapter,
and reduced-motion closing chapter. Body text is dark and readable. Display
headings wrap at narrow widths; chapter numbers move above titles on mobile.
The tablet uses the full robot silhouette. Mobile deliberately crops the robot
horizontally to preserve readable content width and a persistent character rail.
Embroidery texture stays inside recognizable workflow icons, never on the robot.

Initial 320 px and tablet heading overflow was corrected before final evidence.
The closing effect was moved inside the mobile rail after screenshot review.

## Build and repository checks

- Python builder: passes; rebuilding identical inputs produces identical HTML.
- Prettier: passes for CSS, JavaScript, JSON and Markdown changed by this task.
- Repository lint: passes (`pnpm lint`).
- Repository typecheck: passes (`pnpm check`, 33 successful packages).
- Runtime documentation: added local build/verify instructions.

The HTML is approximately 7 MB because it embeds all assets. The builder needs
only Python 3; the verifier additionally needs `agent-browser` and Chrome.
Character prompts and generation provenance are in `art-prompts.json` and README.

This verifies the manual, not a production deployment: it does not launch a raid,
register a worker, connect a wallet or perform payments. Outbound app/docs links
are explicit navigation. All reference repositories remained unchanged. Existing
unrelated working-tree changes were preserved.

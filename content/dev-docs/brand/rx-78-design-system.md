---
version: alpha
name: Boss Raid RX-78
description: Visual identity for Boss Raid public surfaces and internal control-plane UIs.
colors:
  white: '#ffffff'
  ink: '#111111'
  steel: '#5a5b6d'
  blue: '#2c52b3'
  yellow: '#fff867'
  red: '#fb2f38'
  surface: 'rgba(255, 255, 255, 0.58)'
  surface-elevated: 'rgba(255, 255, 255, 0.9)'
  surface-inset: 'rgba(255, 255, 255, 0.96)'
  surface-muted: 'rgba(255, 255, 255, 0.34)'
  code-bg: 'rgba(17, 17, 17, 0.04)'
  line: 'rgba(17, 17, 17, 0.12)'
  line-strong: 'rgba(17, 17, 17, 0.24)'
  accent-surface: 'rgba(251, 47, 56, 0.1)'
  on-blue: '#ffffff'
  on-red: '#ffffff'
  on-yellow: '{colors.ink}'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: clamp(1.6rem, 2.4vw, 2.4rem)
    fontWeight: 700
    lineHeight: 1.05
  display-md:
    fontFamily: Sora
    fontSize: clamp(1.35rem, 2vw, 1.9rem)
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: Sora
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Sora
    fontSize: 0.86rem
    fontWeight: 400
    lineHeight: 1.45
  label-caps:
    fontFamily: 'IBM Plex Mono'
    fontSize: 0.72rem
    fontWeight: 500
    letterSpacing: 0.08em
    lineHeight: 1.2
  mono-md:
    fontFamily: 'IBM Plex Mono'
    fontSize: 0.78rem
    fontWeight: 500
    lineHeight: 1.4
  mono-lg:
    fontFamily: 'IBM Plex Mono'
    fontSize: clamp(1.35rem, 2.4vw, 2rem)
    fontWeight: 600
    lineHeight: 1.1
  cta:
    fontFamily: Oxanium
    fontSize: clamp(1.35rem, 1.85vw, 1.75rem)
    fontWeight: 700
    letterSpacing: 0.1em
    lineHeight: 1
rounded:
  none: 0px
  sm: 6px
spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  stage-y: clamp(12px, 1.7vh, 18px)
  stage-x: clamp(36px, 3vw, 48px)
  panel-gap: clamp(10px, 1.15vh, 14px)
components:
  button-primary:
    backgroundColor: '{colors.blue}'
    textColor: '{colors.on-blue}'
    typography: label-caps
    rounded: sm
    padding: '0 14px'
    height: 40px
  button-primary-hover:
    backgroundColor: color-mix(in srgb, '{colors.blue}' 88%, '{colors.ink}')
  button-cta:
    backgroundColor: 'linear-gradient(135deg, {colors.yellow} 0 84%, {colors.red} 84% 100%)'
    textColor: '{colors.blue}'
    typography: cta
    rounded: none
  eyebrow:
    typography: label-caps
    textColor: '{colors.red}'
  stat-ribbon:
    typography: mono-md
    backgroundColor: transparent
  accent-block-blue:
    backgroundColor: '{colors.blue}'
    textColor: '{colors.on-blue}'
  accent-block-red:
    backgroundColor: '{colors.red}'
    textColor: '{colors.on-red}'
  accent-block-yellow:
    backgroundColor: '{colors.yellow}'
    textColor: '{colors.on-yellow}'
---

## Overview

Boss Raid uses an **RX-78** visual language: Gundam-inspired primary colors on a flat, editorial shell. The public web app (landing, marketplace, account) and internal ops surface share the same tokens, typography roles, and component primitives. The product should feel like one platform — not a dark admin console bolted onto a light marketing site.

**Design intent:** technical marketplace, not generic SaaS. Prefer dividers and whitespace over bordered cards. Use solid RX color blocks sparingly for emphasis (CTAs, alerts, key metrics). Data and controls read in **IBM Plex Mono**; marketing copy and headings use **Sora**; hero CTAs use **Oxanium**.

**Surfaces:**

| Surface | Default theme       | Shell                           |
| ------- | ------------------- | ------------------------------- |
| Web app | Light               | Sidebar + `app-main` stage      |
| Ops UI  | Light (dark toggle) | Top bar + flat workbench        |
| Landing | Light               | Full-bleed hero + workflow deck |

Canonical token source: [`packages/ui/src/theme/tokens.css`](packages/ui/src/theme/tokens.css). Shared primitives: [`packages/ui/src/theme/shell-primitives.css`](packages/ui/src/theme/shell-primitives.css).

## Colors

The palette is fixed. Do not introduce new accent hues.

- **Blue (`#2c52b3`):** Primary actions, stat labels, section rules, links. The structural color.
- **Red (`#fb2f38`):** Eyebrows, savings highlights, danger, primary metric emphasis.
- **Yellow (`#fff867`):** Secondary emphasis, aside dividers, workflow tabs (raid lane).
- **Steel (`#5a5b6d`):** Muted copy, captions, metadata.
- **Ink (`#111111`):** Body text on light backgrounds.
- **White (`#ffffff`):** Page background on public surfaces.

**Dark mode** (`.app-frame--theme-dark`, `.ops-frame--theme-dark`): reuse RX hues; invert surfaces via `tokens.css` dark overrides. Do not gray-wash the brand colors.

**Usage rules:**

- One dominant RX accent per viewport region (e.g. blue rule OR red CTA block, not both fighting).
- Prices and live rates: red text on transparent background — never bury cost in a solid fill.
- Charts: `--chart-ref` (steel), `--chart-market` (blue), `--chart-savings` (red).

## Typography

| Role    | Font          | Use                                          |
| ------- | ------------- | -------------------------------------------- |
| Display | Sora          | Page titles, panel headings                  |
| Body    | Sora          | Lede, descriptions, form labels (non-mono)   |
| Mono    | IBM Plex Mono | Tables, stats, API paths, timestamps, prices |
| CTA     | Oxanium       | Spacebar-shaped primary actions only         |

**Eyebrow** = mono, uppercase, letter-spaced, red. Replaces custom `ops-label` styling.

**Do not** use mono for long prose paragraphs.

## Layout

- **Stage:** max-width `1760px`, horizontal padding `--stage-x`, vertical `--stage-y`. Content **aligns to top** (`align-content: start`), never vertically centered in the viewport.
- **Spacing:** prefer `--panel-gap` between sections; separate sections with `1px solid var(--line)` dividers instead of boxed cards.
- **Grid:** 2-column workbench only when both columns carry data (e.g. order book + charts). No decorative empty art columns.
- **Stats:** horizontal ribbon with vertical dividers between items (see marketplace `market-stats-ribbon`, model detail `model-detail-page__stats`).

## Elevation

Flat by default. `--panel-shadow: none`, `--radius: 0px` on the public shell.

- No gradient panel fills, inset glows, or stacked faux-terminal windows on ops.
- Terminal/code blocks: `--code-bg` inset, mono, optional thin border — not full blue gradient unless inside landing workflow deck.

## Shapes

**Spacebar CTA** (Zephyrus G14 / RX-78 spacebar):

```css
clip-path: polygon(0 0, 100% 0, 100% 77%, 66% 77%, 63.4% 100%, 5.2% 100%, 0 79%);
```

Apply class `rx-spacebar-clip` + `info-panel__cta` for landing/playground/model-detail primary actions. Yellow-to-red gradient background, blue text.

**Accent block** corner notch: `accent-block::before` triangle — use for compact callouts only (TEE panel, onboarding hints).

**Avoid:** `rx-control-pane` clip-path frames, rounded 18px ops panels, decorative `ops-window-stack` layers.

## Components

### Page hero

`page-hero` + optional `page-hero--compact`. Eyebrow, `h1`, lede, actions. Aside slot for CTAs or compact widgets. Single column when no aside.

### Buttons

- **Default:** mono, uppercase, transparent, `1px` border.
- **Primary:** solid blue fill.
- **Danger:** red border/text, no fill.
- **CTA:** spacebar clip + gradient (one per major action area).

### Panels

- **Flat section:** eyebrow + content, bottom border only.
- **Data table:** borderless wrap, mono body, muted uppercase headers.
- **Empty state:** eyebrow title + muted body, no border box.

### Ops-specific mappings

| Legacy ops class             | Replace with                              |
| ---------------------------- | ----------------------------------------- |
| `ops-label`                  | `eyebrow`                                 |
| `ops-panel` (bordered)       | `flat-section` or table directly          |
| `ops-hero` + `ops-hero__art` | `page-hero` + inline `ProviderMesh` panel |
| `ops-window-stack`           | Remove — show mesh in flat panel          |
| `metric-card` (boxed)        | stat ribbon item                          |
| `ops-x402-panel` (rounded)   | flat row + toggle                         |

### Auth gate

Light shell: white background, blue top rule, mono token field, red spacebar unlock. Match web login patterns — not yellow/red/blue stacked control pane.

## Do's and Don'ts

**Do**

- Start page content at the top of the stage.
- Use IBM Plex Mono for all tabular ops data (raids, providers, metrics).
- Reuse `@bossraid/ui` tokens and `shell-primitives.css` in every app.
- Keep ops and web on the same light default with optional dark toggle.
- Use red for live prices; blue for labels; yellow for secondary structure.

**Don't**

- Force ops into a permanent dark `#090909` theme.
- Stack multiple bordered cards in one viewport (readiness + settlement + metrics + providers as separate boxes).
- Use decorative terminal window stacks that duplicate real data panels.
- Center the main stage vertically.
- Hide prices or CTAs inside solid accent blocks without sufficient contrast on the value itself.
- Introduce purple gradients, generic Inter/Roboto, or heavy `border-radius: 18px` admin styling.

## Implementation checklist

When building or redesigning a surface:

1. Import `tokens.css` + `shell-primitives.css`.
2. Apply light tokens by default; scope dark overrides under `--theme-dark` frame class.
3. Replace boxed layouts with divider-based sections.
4. Audit mono usage on every numeric column.
5. Confirm primary CTA uses spacebar clip where the landing page does.
6. Run `pnpm check` in the affected app.

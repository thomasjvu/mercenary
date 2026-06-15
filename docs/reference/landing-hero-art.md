# Landing hero art

The landing hero uses four manga slice panels in `.hero__image-set`. All four slices show the **same** image at different horizontal offsets (`background-size: 400% 100%` + per-slice `background-position` at 0%, 33.333%, 66.666%, 100%). The columns connect visually as one continuous panel.

When the workflow tab changes (seller, raider, buyer), the **whole image swaps** — each mode has its own asset, still split across four slices the same way. See `HERO_IMAGE_BY_WORKFLOW` in `apps/web/src/pages/LandingPage.tsx`.

Light and dark themes share the same assets and markup. The glow difference comes from layered CSS filters and multiply tints — no separate image exports per theme.

## How the glow works

### 1. Multiply tint (`background-blend-mode: multiply`)

Each slice paints a semi-transparent `background-color` on top of the photo. `multiply` darkens the image where the tint overlaps ink, and leaves highlights (visor glows, speed lines) bright.

Base slices (non-landing) use RBY brand tints per column:

- `nth-child(1)`: blue `rgba(44, 82, 179, 0.18)`
- `nth-child(2n)`: red `rgba(251, 47, 56, 0.12)`
- `nth-child(3n)`: yellow `rgba(255, 248, 103, 0.24)`

Landing overrides those with neutral gray multiply layers so light mode reads as high-contrast B&W manga:

```css
.app-shell--landing .hero__slice {
  background-color: rgba(17, 17, 17, 0.08);
  background-blend-mode: multiply;
}
```

`nth-child(2n)` and `nth-child(3n)` use slightly different gray opacities for column-to-column variation.

### 2. Filter stack (theme-specific)

**Light landing** — desaturate to ink, lift contrast:

```css
.app-shell--landing .hero__slice {
  filter: contrast(1.1) saturate(0) brightness(1.02);
}
```

Hover brightens slightly:

```css
.app-shell--landing .hero__image-set:hover .hero__slice {
  filter: contrast(1.14) saturate(0) brightness(1.04);
}
```

**Dark (all hero slices, including landing)** — keep color in the art, dim and soften:

```css
.app-frame--theme-dark .hero__slice {
  filter: saturate(0.84) contrast(1.02) brightness(0.9);
}
```

Landing repeats the same filter under a higher-specificity selector:

```css
.app-frame--theme-dark .app-shell--landing .hero__slice {
  filter: saturate(0.84) contrast(1.02) brightness(0.9);
}
```

Because this rule is more specific than the landing light filter, dark mode keeps yellow visor glows and warm highlights instead of the B&W light-mode pass.

### 3. Layout-only landing overrides

On the landing shell, slices drop borders, radius, and shadow so the art reads flat against the page:

```css
.app-shell--landing .hero__slice {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
```

Slices inherit `background-size: 400% 100%` from `.hero__slice`. Inline `background-image` and `background-position` on each slice pan across one shared asset per workflow tab.

## Source files

| Workflow tab | Asset                                        |
| ------------ | -------------------------------------------- |
| seller       | `apps/web/src/assets/hero-manga.jpg`         |
| raider       | `apps/web/src/assets/hero-manga-raiders.jpg` |
| buyer        | `apps/web/src/assets/hero-manga-buyer.jpg`   |

Raider and buyer art uses the same RX-78 Gundam reference as seller (B&W manga, different pose). Seller keeps baked yellow eyes in the JPG. Raider and buyer use CSS eye overlays (`HERO_EYE_GLOWS_BY_WORKFLOW`) tinted yellow and red to match workflow tabs.

## Changing the look

- **More B&W in light mode**: increase gray `background-color` alpha or push `saturate(0)` harder.
- **Stronger glow in dark mode**: raise `brightness` or `saturate` in `.app-frame--theme-dark .hero__slice`.
- **RBY columns on landing**: remove the landing gray multiply overrides and let the base `nth-child` tints apply.

Primary styles live in `apps/web/src/styles.css` near `.hero__slice` and `.app-shell--landing .hero__slice`.

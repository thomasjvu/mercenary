# Boss Raid docs (papers framework)

Static documentation site for Boss Raid. Framework code lives here; Markdown content lives in repo-root [`content/`](../../content/).

| Collection   | Content dir         | Route         |
| ------------ | ------------------- | ------------- |
| Product docs | `content/docs/`     | `/docs/*`     |
| Dev / brand  | `content/dev-docs/` | `/dev-docs/*` |

## Local preview

From repo root:

```bash
pnpm dev:docs
```

Dev server: `http://localhost:3333`

Theme: copy `.env.example` to `.env.local` (defaults to `VITE_PAPERS_THEME=rx-78`). Homepage landing is off — set `homepageConfig.enabled` in `shared/documentation-config.js` to restore it.

## Authoring

1. Edit Markdown in `content/docs/` or `content/dev-docs/`.
2. Update nav trees in [`shared/documentation-config.js`](shared/documentation-config.js) when adding pages.
3. Regenerate route tables: `pnpm bossraid sync:docs-routes` (repo root).
4. If dev server is running, rerun `pnpm run generate:docs` after tree or Markdown changes.

## Build

```bash
pnpm build:docs
```

## Framework sync

Boss Raid dogfoods [thomasjvu/papers](https://github.com/thomasjvu/papers). See [`content/README.md`](../../content/README.md) for pull/push workflow:

- `pnpm bossraid papers:sync-upstream` — pull template improvements
- `pnpm bossraid papers:sync-downstream` — diff and push portable fixes upstream

Protected Boss Raid overrides are listed in [`scripts/papers-sync-lib.mjs`](../../scripts/papers-sync-lib.mjs) (repo root).

## Upstream template docs

The leftover `src/docs/content/` tree is papers starter content (excluded from Boss Raid builds). It remains for upstream sync reference only.

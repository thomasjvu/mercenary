# Boss Raid documentation content

Markdown source for the papers docs app (`apps/docs`). Framework code and UI live in `apps/docs/`; **this directory is content only**.

## Collections

| Directory                | Route         | Audience                                                                                  |
| ------------------------ | ------------- | ----------------------------------------------------------------------------------------- |
| [`docs/`](docs/)         | `/docs/*`     | Product docs — `overview/`, `buyers/`, `sellers/`, `raiders/`, `reference/`, `operators/` |
| [`dev-docs/`](dev-docs/) | `/dev-docs/*` | Local development, brand, art pipelines, internal references                              |

Navigation trees: [`apps/docs/shared/documentation-config.js`](../apps/docs/shared/documentation-config.js)

Collection registry: [`apps/docs/shared/content-collections.js`](../apps/docs/shared/content-collections.js)

## Agent skill

Canonical agent skill: [`skill.md`](skill.md) — synced to `apps/docs/public/skill.md` and `apps/web/public/skill.md` via `pnpm generate:skill`. Docs install page: `/skill`.

## Commands

```bash
pnpm dev:docs          # local preview (port 3333)
pnpm build:docs        # production static build
pnpm generate:skill    # sync content/skill.md to docs + web public/
pnpm sync:docs-routes  # regenerate API route table in content/docs/reference/routes.md
```

## Framework sync (dogfooding papers)

Boss Raid dogfoods [thomasjvu/papers](https://github.com/thomasjvu/papers). Framework lives in `apps/docs/`; content never leaves `content/`.

### Pull upstream template updates

```bash
pnpm papers:sync-upstream -- --dry-run
pnpm papers:sync-upstream
```

Preserves Boss Raid overrides: `content/`, collection config, and protected files in `scripts/papers-sync-lib.mjs`.

### Push framework fixes upstream

```bash
pnpm papers:sync-downstream              # diff vs papers main
pnpm papers:sync-downstream -- --portable  # list multi-collection overrides to generalize
pnpm papers:sync-downstream -- --dry-run --apply
pnpm papers:sync-downstream -- --apply --branch feat/boss-raid-collections
```

After `--apply`, review `.cache/papers-upstream/` and open a PR to [thomasjvu/papers](https://github.com/thomasjvu/papers).

Portable improvements (content collections, external `contentDir`) are listed in `PORTABLE_IMPROVEMENTS` inside `scripts/papers-sync-lib.mjs`. Generalize those in papers, then shrink the protected set.

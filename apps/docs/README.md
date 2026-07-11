# papers

Static documentation framework — React, Vite, TypeScript, generated Markdown, Pagefind search, `llms.txt` exports, and SEO-friendly static output.

**Boss Raid fork:** use `pnpm` from the repo root, not `npm`. Product content lives in repo-root [`content/`](../../content/README.md). Framework starter pages under `src/docs/content/` are **not published** on the Boss Raid docs site — only `content/docs` and `content/dev-docs` collections are.

## Quick start

```bash
npm install
npm run dev
```

Dev server: `http://localhost:3333` — start at `/docs/getting-started/introduction`.

## Customize

| File / directory                 | Purpose                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `shared/documentation-config.js` | Sidebar tree, homepage, OpenAPI config                               |
| `src/docs/content/`              | Framework starter pages (getting started, deployment, API reference) |
| `.env.local`                     | Site name, canonical URL, GitHub links                               |
| `src/globals.css`                | Theme tokens and typography                                          |
| `themes/`                        | Theme packages (`tokens.css`, `theme.json`)                          |

Author product docs in your own content directory or monorepo `content/` collection — see [FRAMEWORK.md](FRAMEWORK.md).

## Commands

```bash
npm run dev
npm run generate:docs
npm run generate:llms
npm run check:docs-tree
npm run build
npm run release:check
```

## Ship checklist

1. Edit Markdown in `src/docs/content/` (or your external content root).
2. Update `shared/documentation-config.js` when the tree changes.
3. Run `npm run generate:docs` (build does this automatically).
4. Set `VITE_SITE_URL` for production canonical URLs and sitemap.
5. Run `npm test`, `npm run lint`, and `npm run build`.

## Docs

- [FRAMEWORK.md](FRAMEWORK.md) — roadmap and feature inventory
- [RELEASING.md](RELEASING.md) — release process

## Boss Raid fork

This copy dogfoods papers inside the Boss Raid monorepo. Product content lives in repo-root [`content/`](../../content/README.md); framework sync uses `pnpm bossraid papers:sync-upstream` / `papers:sync-downstream` from the repo root.

## License

MIT. See [LICENSE](LICENSE).

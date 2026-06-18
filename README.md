# Boss Raid

![Boss Raid cover](assets/cover.png)

Open marketplace for verified AI inference and multi-agent raids.

One request in → Mercenary routes HTTP providers → one result out with receipt proof. For single model calls, the **discount inference** lane picks the cheapest eligible seller, bills via API keys or x402, and returns `savings_usd` against catalog benchmarks. Successful providers split payout equally.

**Live Mercenary:** https://bossraid-web.pages.dev/mercenary

| Lane               | Route                                 |
| ------------------ | ------------------------------------- |
| Discount inference | `POST /v1/inference/chat/completions` |
| Mercenary raid     | `POST /v1/raid`                       |
| Proof              | `/receipt`, `GET /v1/agent.json`      |

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm build
pnpm dev
```

Defaults: web `http://127.0.0.1:4173`, API `http://127.0.0.1:8787`, ops `http://127.0.0.1:4174`.

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
```

## Docs

Published on the papers site (`apps/docs`) with content in [`content/`](content/). Preview locally with `pnpm dev:docs`.

Full guide: **[content/README.md](content/README.md)**

| Audience      | Start here                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Introduction  | [content/docs/overview/introduction.md](content/docs/overview/introduction.md)                 |
| Buyers        | [content/docs/buyers/buy.md](content/docs/buyers/buy.md)                                       |
| Sellers       | [content/docs/sellers/sell.md](content/docs/sellers/sell.md)                                   |
| Raiders       | [content/docs/raiders/raids.md](content/docs/raiders/raids.md)                                 |
| Operators     | [content/docs/operators/runtime.md](content/docs/operators/runtime.md)                         |
| Brand / RX-78 | [content/dev-docs/brand/rx-78-design-system.md](content/dev-docs/brand/rx-78-design-system.md) |

## Repo layout

**Apps:** `api`, `orchestrator`, `provider-agent`, `evaluator`, `mcp-server`, `web`, `ops`, `video`

**Packages:** `raid-core`, `provider-registry`, `provider-sdk`, `persistence`, `evaluation`, `contracts`, `shared-types`, `ui`

## Examples

- Chat raid: [`examples/chat-completion-request.json`](examples/chat-completion-request.json)
- Native raid: [`examples/unity-bug/task.json`](examples/unity-bug/task.json)
- Strict-private: [`examples/strict-private-raid.json`](examples/strict-private-raid.json)

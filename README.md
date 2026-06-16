# Boss Raid

![Boss Raid cover](assets/cover.png)

Open marketplace for verified AI inference and multi-agent raids.

One request in → Mercenary routes HTTP providers → one result out with receipt proof. For single model calls, the discount inference lane picks the cheapest eligible seller. Successful providers split payout equally.

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

Full guide: **[docs/README.md](docs/README.md)**

| Audience    | Start here                                             |
| ----------- | ------------------------------------------------------ |
| Buyers      | [docs/buy.md](docs/buy.md)                             |
| Sellers     | [docs/sell.md](docs/sell.md)                           |
| Multi-agent | [docs/raids.md](docs/raids.md)                         |
| Operators   | [docs/operators/runtime.md](docs/operators/runtime.md) |

## Repo layout

**Apps:** `api`, `orchestrator`, `provider-agent`, `evaluator`, `mcp-server`, `web`, `ops`, `video`

**Packages:** `raid-core`, `provider-registry`, `provider-sdk`, `persistence`, `evaluation`, `contracts`, `shared-types`, `ui`

## Examples

- Chat raid: [`examples/chat-completion-request.json`](examples/chat-completion-request.json)
- Native raid: [`examples/unity-bug/task.json`](examples/unity-bug/task.json)
- Strict-private: [`examples/strict-private-raid.json`](examples/strict-private-raid.json)

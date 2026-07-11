# AGENTS

## Purpose

This repo builds Boss Raid.

Boss Raid is the platform. Mercenary is the orchestrator agent.

## Read First

- [content/dev-docs/brand/rx-78-design-system.md](/Users/area/repos/boss-raid/content/dev-docs/brand/rx-78-design-system.md) — RX-78 visual identity (published dev-docs)
- [DESIGN.md](/Users/area/repos/boss-raid/DESIGN.md) — RX-78 source tokens (sync with dev-docs when changed)
- [content/README.md](/Users/area/repos/boss-raid/content/README.md) — papers content layout (`content/docs`, `content/dev-docs`)
- [README.md](/Users/area/repos/boss-raid/README.md)
- [content/docs/overview/introduction.md](/Users/area/repos/boss-raid/content/docs/overview/introduction.md)
- [content/docs/buyers/discount-inference.md](/Users/area/repos/boss-raid/content/docs/buyers/discount-inference.md) — discount inference lane
- [content/docs/buyers/buy.md](/Users/area/repos/boss-raid/content/docs/buyers/buy.md)
- [content/docs/sellers/sell.md](/Users/area/repos/boss-raid/content/docs/sellers/sell.md)
- [content/docs/raiders/raids.md](/Users/area/repos/boss-raid/content/docs/raiders/raids.md)
- [content/docs/operators/architecture.md](/Users/area/repos/boss-raid/content/docs/operators/architecture.md)
- [content/docs/reference/routes.md](/Users/area/repos/boss-raid/content/docs/reference/routes.md)
- [content/docs/operators/runtime.md](/Users/area/repos/boss-raid/content/docs/operators/runtime.md)

## Rules

- keep writing short, direct, and technical
- do not reintroduce winner or runner-up payout logic
- successful providers split payout equally
- do not mix privacy scoring and reputation scoring
- prefer `POST /v1/raid` as the native public action route
- document any new command, env var, route, or workflow change
- prefer real behavior over demo-only behavior
- All code must be formatted with Prettier before submission (handled by pre-commit hook)
- Commit messages must follow conventional commits (handled by commitlint)
- Follow the coding standards outlined in the [Coding Standards](#coding-standards) section below.

## Local Workflow

```bash
pnpm check
pnpm build
pnpm dev
```

Manual:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
pnpm dev:docs
```

Operator and deploy workflows use `pnpm bossraid <command>` (`pnpm bossraid help` lists all). Contributor scripts stay in `package.json`.

`/improve` and `/execute-plan` write handoff files to `plans/` (gitignored, local only). Host-specific Party Quest bootstrap runbooks live under `deploy/ops-local/` (gitignored); see [`deploy/ops-local.example/README.md`](deploy/ops-local.example/README.md).

## Current Constraints

- provider workers are HTTP only
- persistence is sqlite or memory (not file-backed)
- public API is raid-oriented by design
- x402 and OpenAI-compatible chat endpoints are built
- privacy engine library gates strict-private raids; attestation proof surfaces are documented in [content/docs/overview/proof.md](/Users/area/repos/boss-raid/content/docs/overview/proof.md) and [content/docs/operators/architecture.md](/Users/area/repos/boss-raid/content/docs/operators/architecture.md#attestation--proof) (raid telemetry still partial)
- full production requires `GET /v1/ops/production-readiness` with `ok: true` (onchain settlement configured, Phala TEE, container eval, no upstream mocks, strong secrets). x402 may remain disabled and still pass readiness (private rehearsal); enable x402 for public paid traffic. SQLite is allowed with a storage warning (controlled launch only).

## If You Change

- architecture: update [content/docs/operators/architecture.md](/Users/area/repos/boss-raid/content/docs/operators/architecture.md)
- routes or payloads: update [content/docs/reference/routes.md](/Users/area/repos/boss-raid/content/docs/reference/routes.md) and the matching buyer/seller page in `content/docs/`. Web route rows are generated from [content/docs/reference/web-routes.template.json](/Users/area/repos/boss-raid/content/docs/reference/web-routes.template.json) via `pnpm bossraid sync:docs-routes`.
- commands or env: update [content/docs/operators/runtime.md](/Users/area/repos/boss-raid/content/docs/operators/runtime.md) and [content/docs/reference/env.md](/Users/area/repos/boss-raid/content/docs/reference/env.md)
- provider registration: update [content/docs/operators/runtime.md](/Users/area/repos/boss-raid/content/docs/operators/runtime.md) deploy checklist and [examples/onboarding/](/Users/area/repos/boss-raid/examples/onboarding/)
- brand / RX-78: update [content/dev-docs/brand/rx-78-design-system.md](/Users/area/repos/boss-raid/content/dev-docs/brand/rx-78-design-system.md) and sync [DESIGN.md](/Users/area/repos/boss-raid/DESIGN.md)
- papers framework: update [apps/docs/FRAMEWORK.md](/Users/area/repos/boss-raid/apps/docs/FRAMEWORK.md); pull with `pnpm bossraid papers:sync-upstream`, push with `pnpm bossraid papers:sync-downstream`

## Coding Standards

All code in this repository must follow these standards:

1. **Formatting**: All code must be formatted with Prettier before submission
2. **Linting**: All code must pass ESLint (`pnpm lint` reports errors only via `--quiet`; use `pnpm lint:strict` locally to surface warnings)
3. **Commits**: Commit messages must follow conventional commits format
4. **Dependencies**: Prefer existing libraries and utilities in the codebase
5. **Security**: Never introduce code that exposes or logs secrets and keys
6. **Testing**: Run lint and typecheck commands before considering work complete

### Available Commands

- `pnpm format`: Format all code with Prettier
- `pnpm lint`: Check code quality with ESLint (`--quiet`, errors only)
- `pnpm lint:strict`: ESLint with warnings visible (local triage)
- `pnpm test:smoke:e2e`: Raid stack smoke test (also runs in CI)
- `pnpm test:money-path`: API billing, bounty escrow, x402 reconciliation, and relayer money-path tests
- `pnpm check`: Typecheck all packages (`tsc --noEmit`)
- `pnpm format:check`: Verify Prettier formatting
- `pnpm build`: Build all packages
- `pnpm dev`: Start development servers

These standards are enforced by:

- Pre-commit hooks (husky + lint-staged) that run Prettier
- Commit message validation (commitlint)
- CI checks that verify formatting and linting pass

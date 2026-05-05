# AGENTS

## Purpose

This repo builds Boss Raid.

Boss Raid is the platform. Mercenary is the orchestrator agent.

## Read First

- [README.md](/Users/area/repos/boss-raid/README.md)
- [docs/architecture.md](/Users/area/repos/boss-raid/docs/architecture.md)
- [docs/interfaces.md](/Users/area/repos/boss-raid/docs/interfaces.md)
- [docs/runtime.md](/Users/area/repos/boss-raid/docs/runtime.md)

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
```

## Current Constraints

- provider workers are HTTP only
- persistence is file-backed
- public API is raid-oriented by design
- x402 and OpenAI-compatible chat endpoints are built
- separate privacy engine is not built yet

## If You Change

- architecture: update [docs/architecture.md](/Users/area/repos/boss-raid/docs/architecture.md)
- routes or payloads: update [docs/interfaces.md](/Users/area/repos/boss-raid/docs/interfaces.md)
- commands or env: update [docs/runtime.md](/Users/area/repos/boss-raid/docs/runtime.md)
- registration story: update [docs/synthesis-registration.md](/Users/area/repos/boss-raid/docs/synthesis-registration.md)

## Coding Standards

All code in this repository must follow these standards:

1. **Formatting**: All code must be formatted with Prettier before submission
2. **Linting**: All code must pass ESLint with no warnings
3. **Commits**: Commit messages must follow conventional commits format
4. **Dependencies**: Prefer existing libraries and utilities in the codebase
5. **Security**: Never introduce code that exposes or logs secrets and keys
6. **Testing**: Run lint and typecheck commands before considering work complete

### Available Commands

- `pnpm format`: Format all code with Prettier
- `pnpm lint`: Check code quality with ESLint
- `pnpm check`: Run both format check and lint
- `pnpm build`: Build all packages
- `pnpm dev`: Start development servers

These standards are enforced by:

- Pre-commit hooks (husky + lint-staged) that run Prettier and ESLint
- Commit message validation (commitlint)
- CI checks that verify formatting and linting pass

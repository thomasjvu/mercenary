# Contributing

## Scope

Boss Raid is a raid-oriented orchestration platform.

Mercenary is the orchestrator inside Boss Raid.

Read these first:

- [README.md](/Users/area/repos/boss-raid/README.md)
- [content/README.md](/Users/area/repos/boss-raid/content/README.md)
- [content/docs/operators/architecture.md](/Users/area/repos/boss-raid/content/docs/operators/architecture.md)
- [content/docs/reference/routes.md](/Users/area/repos/boss-raid/content/docs/reference/routes.md)
- [content/docs/operators/runtime.md](/Users/area/repos/boss-raid/content/docs/operators/runtime.md)
- [AGENTS.md](/Users/area/repos/boss-raid/AGENTS.md)

## Rules

- Keep changes short, direct, and technical.
- Do not reintroduce winner or runner-up payout logic.
- Successful providers split payout equally.
- Do not mix privacy scoring and reputation scoring.
- Prefer `POST /v1/raid` as the native public action route.
- Document any new command, env var, route, or workflow change.
- Prefer real behavior over demo-only behavior.

## Local Workflow

```bash
pnpm install
cp .env.example .env
pnpm check
pnpm format:check
pnpm lint
pnpm build
pnpm test:unit
pnpm test:money-path
pnpm test:smoke:e2e
pnpm dev
```

Operator and deploy commands (`sync:*`, `bootstrap:*`, `docker:*`, etc.) use `pnpm bossraid <command>`. Run `pnpm bossraid help` for the full list.

Manual dev entrypoints:

```bash
pnpm dev:providers
pnpm dev:api
pnpm dev:web
pnpm dev:ops
```

## Change Discipline

- Keep auth material out of public routes and client bundles.
- Keep provider workers HTTP only.
- Keep the public API raid-oriented by design.
- Default evaluator runtime execution stays off unless explicitly needed and documented.
- If you change architecture, routes, commands, env, or registration flow, update the matching pages in `content/docs/`.

## Pull Requests

GitHub and Forgejo auto-fill the PR template. For bugs or features, pick an issue template when opening an issue.

- Explain the user-visible behavior change.
- List new env vars, routes, commands, or workflows.
- Include the verification commands you ran.
- Call out any remaining risk or follow-up work.

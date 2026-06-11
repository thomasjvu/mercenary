# Contributing

## Scope

Boss Raid is a raid-oriented orchestration platform.

Mercenary is the orchestrator inside Boss Raid.

Read these first:

- [README.md](/Users/area/repos/boss-raid/README.md)
- [docs/README.md](/Users/area/repos/boss-raid/docs/README.md)
- [docs/operators/architecture.md](/Users/area/repos/boss-raid/docs/operators/architecture.md)
- [docs/reference/routes.md](/Users/area/repos/boss-raid/docs/reference/routes.md)
- [docs/operators/runtime.md](/Users/area/repos/boss-raid/docs/operators/runtime.md)
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
pnpm build
pnpm --filter @bossraid/api test
pnpm --filter @bossraid/orchestrator test
pnpm dev
```

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
- If you change architecture, routes, commands, env, or registration flow, update the matching docs in `docs/`.

## Pull Requests

- Explain the user-visible behavior change.
- List new env vars, routes, commands, or workflows.
- Include the verification commands you ran.
- Call out any remaining risk or follow-up work.

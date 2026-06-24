# OpenAPI

Boss Raid publishes two OpenAPI specs generated from the live Fastify route schemas:

| Spec         | File                    | Audience                        |
| ------------ | ----------------------- | ------------------------------- |
| Public API   | `openapi-v1.yaml`       | Buyers, sellers, raiders        |
| Operator API | `openapi-internal.yaml` | Ops session, runtime, readiness |

Open the interactive viewer at [/docs/reference/openapi](/docs/reference/openapi).

## Regenerate

```bash
pnpm bossraid sync:openapi
```

CI runs `pnpm bossraid check:openapi` to fail when committed specs drift from `@fastify/swagger` output.

## Source of truth

Route schemas live in `apps/api/src/routes/*` and shared JSON Schema helpers in `packages/openapi-schemas/`. The export script boots an in-memory API instance and writes filtered specs into `apps/docs/public/`.

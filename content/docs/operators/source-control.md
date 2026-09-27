# Source control & CI/CD

Boss Raid is **Forgejo-first**. GitHub is a public/operator mirror, not the canonical write path.

## Canonical hosts

| Role                | Host                                     | Repo                                                                     |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| **Source of truth** | [Forgejo](https://forgejo.thomasjvu.com) | [`bossraid/mercenary`](https://forgejo.thomasjvu.com/bossraid/mercenary) |
| **Mirror**          | GitHub                                   | [`thomasjvu/mercenary`](https://github.com/thomasjvu/mercenary)          |
| **CI runner**       | `spectre` (native `linux/amd64`)         | Forgejo Actions `act_runner`                                             |
| **Image publisher** | GitHub Actions mirror                    | GHCR images from `main` and version tags                                 |

Do **not** build production images with QEMU/buildx on Apple Silicon. Phala CVM pulls **amd64** only.

## Daily workflow

```bash
# remotes (example)
git remote add forgejo https://forgejo.thomasjvu.com/bossraid/mercenary.git   # once
git remote add github  git@github.com:thomasjvu/mercenary.git               # optional local name

# develop on Forgejo
git push forgejo development
git push forgejo HEAD:main   # when promoting — prefer PR on Forgejo
```

After push, Forgejo **push-mirrors** to GitHub (`sync_on_commit` + interval). You should not need to `git push` GitHub for normal work once the mirror is healthy.

Configure / refresh mirror:

```bash
export FORGEJO_TOKEN=…   # admin token (Infisical: FORGEJO_ADMIN_TOKEN)
export GITHUB_TOKEN=…    # PAT with repo + write:packages if used for GHCR too
node examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs
```

If mirror sync fails with `Could not resolve host: github.com` inside the Forgejo container, pin DNS on the Compose service (`dns: [8.8.8.8, 1.1.1.1]`) and/or add a host entry for `github.com`. Spectre’s `~/forgejo/docker-compose.yml` should keep explicit DNS for the Coolify network.

## CI layout

| Path                                                                                | Runs where             | Purpose                               |
| ----------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| [`.forgejo/workflows/ci.yml`](../../../.forgejo/workflows/ci.yml)                   | Forgejo Actions        | Verify (check, lint, tests, smoke)    |
| [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)                     | GitHub Actions         | Mirror / public CI parity             |
| [`.github/workflows/docker-image.yml`](../../../.github/workflows/docker-image.yml) | GitHub `ubuntu-latest` | GHCR publish on `main` / version tags |

GitHub Actions is the sole GHCR publisher. Its built-in `GITHUB_TOKEN` avoids a separate
`GHCR_TOKEN` secret in Forgejo; Forgejo does not build or push duplicate images.

### Spectre runner

Host: `spectre.thomasjvu.com` (native x86_64 Docker).

```bash
# on spectre — see deploy/ops-local.example/spectre/act-runner.md
# registers label: ubuntu-latest:docker://node:22-bookworm
```

The Forgejo verification workflow uses the `ubuntu-latest` container label. The `spectre:host`
label is available for operator maintenance and is not used to publish images.

## Branch model

| Branch        | Role                                         |
| ------------- | -------------------------------------------- |
| `development` | Default integration branch (Forgejo default) |
| `staging`     | Pre-prod                                     |
| `main`        | Production-line; triggers image publish      |

## Catalog drift

The mirrored `catalog-drift.yml` workflows run daily at 07:23 UTC or manually. They fetch public catalogs and run `pnpm bossraid sync:inference-catalog -- --check`; price/model changes, fetch errors, and source age over seven days fail the job. No API keys, automatic commits, or deployment are involved. Refresh and review the snapshot on a development branch, then ship through the normal image workflow. Regular CI checks saved catalog inputs before building.

## Phala deploy after CI

```bash
# image published by the GitHub mirror workflow, e.g.:
# ghcr.io/thomasjvu/boss-raid:sha-<commit>
# ghcr.io/thomasjvu/boss-raid:main | :latest

pnpm bossraid bootstrap:phala:env
pnpm bossraid phala:secrets:check deploy/phala/.env
phala deploy --cvm-id bossraid-main \
  --compose deploy/phala/docker-compose.yml \
  -e deploy/phala/.env \
  --wait
```

## Related

- Campaign Forgejo helpers: [`examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs`](../../../examples/campaigns/bossraid-development/scripts/setup-forgejo-ops.mjs)
- Runtime / deploy: [runtime.md](runtime.md)
- Local ops (gitignored host runbooks): [`deploy/ops-local.example/README.md`](../../../deploy/ops-local.example/README.md)

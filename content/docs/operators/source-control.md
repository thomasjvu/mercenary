# Source control & CI/CD

Boss Raid is **Forgejo-first**. GitHub is a public/operator mirror, not the canonical write path.

## Canonical hosts

| Role                | Host                                     | Repo                                                                     |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| **Source of truth** | [Forgejo](https://forgejo.thomasjvu.com) | [`bossraid/mercenary`](https://forgejo.thomasjvu.com/bossraid/mercenary) |
| **Mirror**          | GitHub                                   | [`thomasjvu/mercenary`](https://github.com/thomasjvu/mercenary)          |
| **Build server**    | `spectre` (native `linux/amd64`)         | Forgejo Actions `act_runner` label `spectre`                             |

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

| Path                                                                                  | Runs where             | Purpose                               |
| ------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| [`.forgejo/workflows/ci.yml`](../../../.forgejo/workflows/ci.yml)                     | Forgejo Actions        | Verify (check, lint, tests, smoke)    |
| [`.forgejo/workflows/docker-image.yml`](../../../.forgejo/workflows/docker-image.yml) | **`runs-on: spectre`** | Native amd64 image build → GHCR       |
| [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)                       | GitHub Actions         | Mirror / public CI parity             |
| [`.github/workflows/docker-image.yml`](../../../.github/workflows/docker-image.yml)   | GitHub `ubuntu-latest` | Backup amd64 publish on `main` / tags |

### Forgejo secrets (repo or org)

| Secret          | Used by                                            |
| --------------- | -------------------------------------------------- |
| `GHCR_TOKEN`    | Docker workflow — GitHub PAT with `write:packages` |
| `GHCR_USERNAME` | Optional; default `thomasjvu`                      |

### Spectre runner

Host: `spectre.thomasjvu.com` (native x86_64 Docker).

```bash
# on spectre — see deploy/ops-local.example/spectre/act-runner.md
# registers labels: spectre:host, ubuntu-latest:docker://node:22-bookworm
```

Jobs with `runs-on: spectre` must use **`spectre:host`** so steps run on the host Docker daemon (required for Phala-bound amd64 images). If the runner is registered as `spectre:docker://…`, image builds fail — re-register per the act-runner runbook.

## Branch model

| Branch        | Role                                         |
| ------------- | -------------------------------------------- |
| `development` | Default integration branch (Forgejo default) |
| `staging`     | Pre-prod                                     |
| `main`        | Production-line; triggers image publish      |

## Phala deploy after CI

```bash
# image published by Forgejo docker workflow, e.g.:
# ghcr.io/thomasjvu/boss-raid:development
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

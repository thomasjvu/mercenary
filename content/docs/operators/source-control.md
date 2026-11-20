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

OpenAPI drift checks run before builds in both CI workflows. Builds regenerate tracked specs; checking first compares exported routes against the committed schemas and catches stale specs. Regression coverage: `node --test scripts/lib/openapi-ci.test.mjs`.

| Path                                                                                | Runs where             | Purpose                               |
| ----------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| [`.forgejo/workflows/ci.yml`](../../../.forgejo/workflows/ci.yml)                   | Forgejo Actions        | Verify (check, lint, tests, smoke)    |
| [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)                     | GitHub Actions         | Mirror / public CI parity             |
| [`.github/workflows/docker-image.yml`](../../../.github/workflows/docker-image.yml) | GitHub `ubuntu-latest` | GHCR publish on `main` / version tags |

GitHub Actions is the sole GHCR publisher. Its built-in `GITHUB_TOKEN` avoids a separate
`GHCR_TOKEN` secret in Forgejo; Forgejo does not build or push duplicate images.

### Build reuse and smoke evidence

Both verification workflows build the workspace once. That includes the docs site;
there is no second direct docs build. Bounty and raid smoke commands use
`--skip-build` only after that job's successful build. The flag checks required
executables exist; it does not validate freshness or authorize reuse from another
commit or job. Standalone smoke commands still build by default. No checks are
reused across promotion branches.

The production deploy-env audit runs before typecheck and builds. CI regression
coverage runs with `node --test scripts/lib/openapi-ci.test.mjs scripts/lib/e2e-build.test.mjs`.
Money-path, attestation, dependency checks, and both smoke flows remain separate gates.

Successful smoke flows write allowlisted JSON reports to `temp/ci/raid.json` and
`temp/ci/bounty.json`, including build execution/reuse, result assertions, and a
repeat command. Raid evidence includes the fixture SHA-256. Reports exclude auth
responses, tokens, private keys, databases, and artifact bodies. Each smoke run
removes its previous report before starting, so an earlier success cannot survive
a failed rerun. CI uploads these files as `smoke-evidence` for 14 days, including
any completed report when a later step fails. Forgejo uses its v3 artifact action;
GitHub uses v4. These reports are diagnostic evidence, not promotion authorization.

Image publishing imports and exports BuildKit's GitHub Actions cache with a
separate `<image_name>-amd64` scope per target. Cache misses run the full build;
source, lockfile, dependency patches, and Dockerfile changes still invalidate their
layers. This cache is separate from the runner's pnpm store. Image publishing
remains on GitHub and targets native `linux/amd64`.

Measured baseline: [main CI run 39071353248](https://github.com/thomasjvu/mercenary/actions/runs/39071353248)
took 8m18s on October 17, 2026: build 89s, duplicate docs build 36s,
bounty smoke 13s, raid smoke 41s, package tests 167s, money-path tests 30s.
[Image publishing](https://github.com/thomasjvu/mercenary/actions/runs/39071353427)
took up to 3m45s across parallel targets. Removing the second docs build eliminates
that measured 36s step; other savings require comparable hosted cold/warm runs.
The last failed verification run stopped at dependency audit; that gate remains.

### Dependency security

CI runs `pnpm test:dependency-security` before `pnpm audit --audit-level=high`. Security overrides and the lockfile select patched upstream releases.

`braces@3.0.3` has no published fix for `GHSA-vfj7-8cjw-p6xm`. `patches/braces@3.0.3.patch` limits parser nesting and recursive compile/expand/stringify AST walks to 128 levels. Regression tests cover ordinary globs, deeply nested brace/parenthesis strings, supplied ASTs, and cycles. The workspace audit exception applies only to this locally mitigated advisory; remove the patch and exception when an upstream fix is available. No other advisory is suppressed.

The MCP server requires `@modelcontextprotocol/sdk >=1.31.0` to keep the dependency graph on the patched OAuth implementation. Boss Raid serves MCP over stdio and does not configure an SDK OAuth client. Receipt tests and a stdio client handshake verify the work-tool contract after upgrades.

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

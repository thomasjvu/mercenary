# Spectre — Forgejo act_runner (native amd64)

Spectre is the Boss Raid **build server**. Register one host runner so `.forgejo/workflows/docker-image.yml` can build without QEMU.

## Prerequisites

- Docker installed (amd64)
- Forgejo Actions enabled (`[actions] ENABLED = true`)
- Registration token from Forgejo:

```bash
docker exec -u git forgejo forgejo actions generate-runner-token
```

Or Site Admin → Actions → Runners in the UI.

## Install (Docker, recommended)

```bash
mkdir -p ~/bossraid-ops/act-runner/data
cd ~/bossraid-ops/act-runner

# Pin a runner image compatible with Forgejo 1.21.x
export RUNNER_IMAGE=code.forgejo.org/forgejo/runner:3.5.1
export FORGEJO_INSTANCE_URL=https://forgejo.phantasy.bot
export RUNNER_NAME=spectre
# paste token once; do not commit
export RUNNER_REGISTRATION_TOKEN=…

docker run --rm -it \
  -v "$PWD/data:/data" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CONFIG_FILE=/data/config.yaml \
  "$RUNNER_IMAGE" \
  forgejo-runner register --no-interactive \
    --instance "$FORGEJO_INSTANCE_URL" \
    --token "$RUNNER_REGISTRATION_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "spectre:host,ubuntu-latest:docker://node:22-bookworm"

# daemon
docker run -d --restart unless-stopped --name forgejo-act-runner \
  -v "$PWD/data:/data" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CONFIG_FILE=/data/config.yaml \
  "$RUNNER_IMAGE" \
  forgejo-runner daemon
```

Labels:

| Label           | Mode      | Use                                      |
| --------------- | --------- | ---------------------------------------- |
| `spectre`       | `host`    | Docker image builds (`runs-on: spectre`) |
| `ubuntu-latest` | container | Node CI jobs                             |

## Repo secrets for image push

On `bossraid/mercenary` (Forgejo):

- `GHCR_TOKEN` — GitHub PAT with `write:packages` (and `read:packages`)
- `GHCR_USERNAME` — optional, default `thomasjvu`

## Health

```bash
docker logs -f forgejo-act-runner
# UI: https://forgejo.phantasy.bot/admin/actions/runners
```

## Security

- Never store registration tokens in git
- Prefer Infisical for long-lived PATs (`FORGEJO_ADMIN_TOKEN`, GHCR PAT)
- Spectre forgejo git remotes must **not** embed tokens in the URL; use a credential helper

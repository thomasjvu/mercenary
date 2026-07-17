# Spectre — Forgejo act_runner (native amd64)

Spectre is the Boss Raid **build server**. Register one **host** runner so `.forgejo/workflows/docker-image.yml` can build without QEMU.

## Prerequisites

- Docker installed (amd64)
- Forgejo Actions enabled (`[actions] ENABLED = true`)
- Registration token from Forgejo:

```bash
docker exec -u git forgejo forgejo actions generate-runner-token
```

Or Site Admin → Actions → Runners in the UI.

## Install (host binary — preferred)

Dockerized act-runner images often **lack the Docker CLI**. Label `*:host` then executes inside that container and `docker build` fails with exit 127. Prefer a **host binary** registered against **local** Forgejo (`http://127.0.0.1:3000`) so Cloudflare DNS outages do not break task polling.

```bash
TOKEN=$(docker exec -u git forgejo forgejo actions generate-runner-token)

mkdir -p ~/bossraid-ops/act-runner-host
cd ~/bossraid-ops/act-runner-host

# binary e.g. ~/forgejo/runner/forgejo-runner (amd64 release)
forgejo-runner register --no-interactive \
  --instance "http://127.0.0.1:3000" \
  --token "$TOKEN" \
  --name "spectre-host" \
  --labels "spectre:host,ubuntu-latest:docker://node:22-bookworm"

forgejo-runner generate-config > config.yaml
nohup forgejo-runner daemon --config "$PWD/config.yaml" > runner.log 2>&1 &
echo $! > runner.pid
```

Keep a local checkout at `~/bossraid-ops/mercenary` so image jobs can `git clone --shared` instead of pulling the monorepo over Cloudflare.

Labels:

| Label           | Mode                      | Use                                      |
| --------------- | ------------------------- | ---------------------------------------- |
| `spectre`       | `host` (real host binary) | Docker image builds (`runs-on: spectre`) |
| `ubuntu-latest` | container                 | Node CI jobs                             |

**Required:** `spectre` must be `spectre:host`, never `spectre:docker://…`.  
Image jobs run `docker build` / `docker push` on the host. A dockerized label runs steps inside a container without a usable host Docker CLI (exit 127 or silent queue stall).

Pin the same labels in `config.yaml` so restarts do not fall back to a stale `.runner` file:

```yaml
runner:
  labels:
    - 'spectre:host'
    - 'ubuntu-latest:docker://node:22-bookworm'
```

### Verify

After start, the daemon log must include host labels, e.g.:

```text
runner: spectre-host, with labels: [spectre ubuntu-latest]
```

Local check (no secrets):

```bash
python3 -c "import json; print(json.load(open('$HOME/bossraid-ops/act-runner-host/.runner'))['labels'])"
# expect: ['spectre:host', 'ubuntu-latest:docker://node:22-bookworm']
```

### Repair wrong labels

If `.runner` shows `spectre:docker://…`:

```bash
cd ~/bossraid-ops/act-runner-host
kill "$(cat runner.pid)" 2>/dev/null || true
cp -a .runner ".runner.bak.$(date +%Y%m%d%H%M%S)"
TOKEN=$(docker exec -u git forgejo forgejo actions generate-runner-token)
rm -f .runner
forgejo-runner register --no-interactive \
  --instance "http://127.0.0.1:3000" \
  --token "$TOKEN" \
  --name "spectre-host" \
  --labels "spectre:host,ubuntu-latest:docker://node:22-bookworm"
# ensure config.yaml runner.labels matches (see pin above)
nohup forgejo-runner daemon --config "$PWD/config.yaml" > runner.log 2>&1 &
echo $! > runner.pid
tail -20 runner.log
```

Old offline runner rows may remain in Forgejo Admin → Actions → Runners; delete them when convenient.

## Repo secrets for image push

On `bossraid/mercenary` (Forgejo):

- `GHCR_TOKEN` — GitHub PAT with `write:packages` (and `read:packages`)
- `GHCR_USERNAME` — optional, default `thomasjvu`

## Health

```bash
tail -f ~/bossraid-ops/act-runner-host/runner.log
# UI: https://forgejo.thomasjvu.com/admin/actions/runners
```

## Security

- Never store registration tokens in git
- Prefer Infisical for long-lived PATs (`FORGEJO_ADMIN_TOKEN`, GHCR PAT)
- Spectre forgejo git remotes must **not** embed tokens in the URL; use a credential helper

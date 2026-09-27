# Spectre — Forgejo Actions runner (native amd64)

Spectre runs Boss Raid's Forgejo verification workflow. GitHub Actions on the mirrored repo is the sole GHCR image publisher, so this runner does not need registry credentials.

## Prerequisites

- Docker installed (amd64)
- Forgejo Actions enabled (`[actions] ENABLED = true`)
- Registration token from Forgejo:

```bash
docker exec -u git forgejo forgejo actions generate-runner-token
```

Or Site Admin → Actions → Runners in the UI.

## Install (host binary — preferred)

Use a **host binary** registered against **local** Forgejo (`http://127.0.0.1:3000`) so Cloudflare DNS outages do not break task polling. Forgejo runs the `ubuntu-latest` CI job in a Node container; image publishing runs on GitHub Actions.

```bash
TOKEN=$(docker exec -u git forgejo forgejo actions generate-runner-token)

mkdir -p ~/bossraid-ops/act-runner-host
cd ~/bossraid-ops/act-runner-host

# binary e.g. ~/forgejo/runner/forgejo-runner (amd64 release)
forgejo-runner register --no-interactive \
  --instance "http://127.0.0.1:3000" \
  --token "$TOKEN" \
  --name "spectre-ci" \
  --labels "ubuntu-latest:docker://node:22-bookworm"

forgejo-runner generate-config > config.yaml
nohup forgejo-runner daemon --config "$PWD/config.yaml" > runner.log 2>&1 &
echo $! > runner.pid
```

Runner label:

| Label           | Mode      | Use             |
| --------------- | --------- | --------------- |
| `ubuntu-latest` | container | Forgejo CI jobs |

Pin the label in `config.yaml` so restarts do not fall back to a stale `.runner` file:

```yaml
runner:
  labels:
    - 'ubuntu-latest:docker://node:22-bookworm'
```

### Verify

After start, the daemon log must include the CI label, e.g.:

```text
runner: spectre-ci, with labels: [ubuntu-latest]
```

Local check (no secrets):

```bash
python3 -c "import json; print(json.load(open('$HOME/bossraid-ops/act-runner-host/.runner'))['labels'])"
# expect: ['ubuntu-latest:docker://node:22-bookworm']
```

An unused `spectre:host` label on an existing runner is harmless; current workflows do not require it.

## Health

```bash
tail -f ~/bossraid-ops/act-runner-host/runner.log
# UI: https://forgejo.thomasjvu.com/admin/actions/runners
```

## Security

- Never store registration tokens in git
- Prefer Infisical for the long-lived `FORGEJO_ADMIN_TOKEN`
- Spectre forgejo git remotes must **not** embed tokens in the URL; use a credential helper

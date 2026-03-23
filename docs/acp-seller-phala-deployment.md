# ACP Seller Deployment On Phala

Boss Raid now includes a repo-owned deployment path for the ACP seller runtimes behind `Gamma`, `Riko`, and `Dottie`.

Use this path when you want the ACP offerings to stay online 24/7 without relying on ACP's built-in Railway deploy flow.

## What Runs

- one shared ACP seller image built from the local ACP workspace copy at `temp/openclaw-acp-work`
- three long-lived containers from that same image
- one container per ACP agent:
  - `Gamma` for `gbstudio_game_build`
  - `Riko` for `remotion_video_scene`
  - `Dottie` for `pixel_art_asset_pack`
- each container uses a different `LITE_AGENT_API_KEY`, so the same image serves a different offering set depending on the active ACP identity
- each container can also use its own Venice inference key
- each container also gets an explicit per-agent Venice model override, which defaults to `minimax-m27`
- the handlers now generate real artifact bundles instead of planning-only briefs:
  - `Gamma` emits a GB Studio starter project with PNG assets and project resources
  - `Riko` emits storyboard frames, captions, a Remotion source bundle, and a preview MP4 when `ffmpeg` is present
  - `Dottie` emits PNG sprites, a spritesheet, and metadata
- the image installs `ffmpeg` so the Phala runtime can produce the `Riko` preview video
- the compose file also forces `ACP_DISABLE_PID_TRACKING=1` and `ACP_DISABLE_CONFIG_WRITES=1` so the seller runtime stays compatible with the read-only Phala root filesystem

The seller runtime is outbound-only. It opens a WebSocket to ACP and does not need a public port.

## Files

- [deploy/acp-seller/Dockerfile](/Users/area/Desktop/boss-raid/deploy/acp-seller/Dockerfile)
- [deploy/phala/acp-sellers.docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/acp-sellers.docker-compose.yml)
- [deploy/phala/acp-sellers.env.example](/Users/area/Desktop/boss-raid/deploy/phala/acp-sellers.env.example)
- [scripts/build-acp-seller-image.mjs](/Users/area/Desktop/boss-raid/scripts/build-acp-seller-image.mjs)
- [scripts/export-acp-seller-env.mjs](/Users/area/Desktop/boss-raid/scripts/export-acp-seller-env.mjs)

## Prerequisites

- the ACP offerings are already registered on ACP
- `temp/openclaw-acp-work` exists and includes the seller runtime plus the `Gamma`, `Riko`, and `Dottie` offering directories
- the local ACP config includes stored API keys for those three agents
- you have a container registry Phala can pull from
- you are authenticated with `phala`

## 1. Export The Secret Env File

Run:

```bash
pnpm acp-seller:env:export
```

This writes `temp/acp-sellers.phala.env`.

That file is secret. It contains the ACP API keys for:

- `ACP_GAMMA_API_KEY`
- `ACP_RIKO_API_KEY`
- `ACP_DOTTIE_API_KEY`

If these env vars are set in your shell before export, they are carried into the generated file too:

- `VENICE_API_KEY_GAMMA`
- `VENICE_API_KEY_RIKO`
- `VENICE_API_KEY_DOTTIE`
- `VENICE_API_BASE`
- `VENICE_MODEL`
- `VENICE_MODEL_GAMMA`
- `VENICE_MODEL_RIKO`
- `VENICE_MODEL_DOTTIE`
- `VENICE_REASONING_EFFORT`

The file is written under `temp/`, so it stays outside git.

## 2. Build The Shared Seller Image

Run:

```bash
pnpm acp-seller:docker:build
```

Defaults:

- ACP source: `temp/openclaw-acp-work`
- staged Docker context: `temp/acp-seller-build`
- image tag: `bossraid-acp-seller:local`
- platform: `linux/amd64`

Optional env:

- `BOSSRAID_ACP_REPO_PATH`
- `BOSSRAID_ACP_SELLER_CONTEXT_OUT`
- `BOSSRAID_ACP_SELLER_IMAGE`
- `BOSSRAID_ACP_SELLER_PLATFORM`

The build script stages a sanitized context and only copies:

- `package.json`
- `package-lock.json` when present
- `tsconfig.json`
- `bin/`
- `src/`

It does not copy `config.json` or `config.backup.json` into the build context.

## 3. Push The Image To A Public Registry

Phala needs a pullable image reference. The simplest path is a public Docker Hub image.

Example:

```bash
export BOSSRAID_ACP_SELLER_IMAGE=docker.io/<user>/bossraid-acp-seller:latest
pnpm acp-seller:docker:build
docker push "$BOSSRAID_ACP_SELLER_IMAGE"
```

Then update `temp/acp-sellers.phala.env` so `BOSSRAID_ACP_SELLER_IMAGE` matches the pushed tag.

## 4. Deploy To Phala

Run:

```bash
phala deploy \
  --name bossraid-acp-sellers \
  --compose deploy/phala/acp-sellers.docker-compose.yml \
  -e temp/acp-sellers.phala.env \
  --instance-type tdx.small \
  --region us-west \
  --public-logs=false \
  --public-sysinfo=false
```

Use `tdx.medium` instead if you want more room for heavier handler logic.

## 5. Verify Runtime Health

List CVMs:

```bash
phala cvms list --json
```

Tail logs for one seller container:

```bash
phala cvms logs bossraid-acp-sellers --container gamma --follow
phala cvms logs bossraid-acp-sellers --container riko --follow
phala cvms logs bossraid-acp-sellers --container dottie --follow
```

Healthy startup should show:

- the resolved ACP agent name
- the sanitized offering directory
- the offering list for that agent
- the ACP socket connection coming up

If a seller-specific Venice key is present, that seller uses Venice's OpenAI-compatible `chat/completions` endpoint for structured planning output before generating files. If it is absent, that seller still produces a deterministic local artifact bundle. The shared default model is `minimax-m27`, and the exported per-agent overrides also default to `minimax-m27` unless you set different values.

## Hetzner Builder Path

If you want to build on `hetzner-phantasy-001` instead of the local machine, copy the staged context and Dockerfile to that host and push from there.

Example:

```bash
pnpm acp-seller:docker:build
rsync -az temp/acp-seller-build/ hetzner-phantasy-001:~/bossraid-acp-seller-build/
rsync -az deploy/acp-seller/Dockerfile hetzner-phantasy-001:~/bossraid-acp-seller-build/Dockerfile
ssh hetzner-phantasy-001 'cd ~/bossraid-acp-seller-build && docker buildx build --platform linux/amd64 -f Dockerfile -t docker.io/<user>/bossraid-acp-seller:latest . --push'
```

Use that only if the remote host is reachable and already has Docker registry auth.

## Current Limits

- ACP's built-in `serve deploy` path still only targets Railway
- this Phala path is a custom container deployment built around the same seller runtime
- the runtime has no public HTTP status route, so verification is log-based
- if an offering depends on external API keys, add those env vars to `temp/acp-sellers.phala.env` before deploy

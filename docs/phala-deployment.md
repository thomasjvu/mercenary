# Phala Deployment

Boss Raid now ships a multi-image Docker deployment path intended for multi-service CVM hosting.

The current container topology is:

- `gateway`: serves the public web app at `/`, the ops app at `/ops/`, and proxies `/api` plus `/ops-api` to the API service
- `api`: runs Mercenary, raid orchestration, persistence, settlement wiring, and the public/internal HTTP routes
- `evaluator`: runs real build and test probes over a shared Unix socket with a read-only rootfs, no container network, and disposable per-job containers
- `provider-a`, `provider-b`, `provider-c`: run the HTTP provider workers on the private container network

Use these files:

- [Dockerfile](/Users/area/Desktop/boss-raid/Dockerfile)
- [docker-compose.yml](/Users/area/Desktop/boss-raid/docker-compose.yml)
- [deploy/phala/docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/docker-compose.yml)
- [deploy/phala/.env.example](/Users/area/Desktop/boss-raid/deploy/phala/.env.example)
- [deploy/phala/providers-only.docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.docker-compose.yml)
- [deploy/phala/providers-only.env.example](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.env.example)
- [deploy/phala/acp-sellers.docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/acp-sellers.docker-compose.yml)
- [deploy/phala/acp-sellers.env.example](/Users/area/Desktop/boss-raid/deploy/phala/acp-sellers.env.example)
- [examples/providers.compose.json](/Users/area/Desktop/boss-raid/examples/providers.compose.json)

## Recommended Split

The current recommended hosted split is:

- EigenCompute: Boss Raid gateway, API, Mercenary orchestration, evaluator, attested runtime, and attested result routes
- Phala: HTTP provider fleet and ACP seller sidecars

That keeps the verifiable off-chain execution core on EigenCompute for the hackathon track while moving horizontally scalable provider workers onto Phala credits.

## Local Docker

Build and boot the stack:

```bash
pnpm docker:build
pnpm docker:up
```

Public entrypoint:

- `http://127.0.0.1:8080`

Container notes:

- only the gateway publishes a host port
- the API persists SQLite state in the `bossraid-data` volume at `/data/bossraid-state.sqlite`
- the API loads [examples/providers.compose.json](/Users/area/Desktop/boss-raid/examples/providers.compose.json), which now supports `${ENV_VAR}` interpolation for provider tokens
- ops stays same-origin because the gateway owns both `/ops/` and `/ops-api`
- the app and evaluator images now build only the packages the deployed stack actually runs, so Docker builds no longer compile the Remotion app
- runtime probes now execute through the isolated evaluator service instead of the API container
- the runtime images now run as a dedicated non-root user, and the shipped compose stacks default services to read-only root filesystems plus tmpfs `/tmp`
- the evaluator service now binds `/socket/evaluator.sock` and the API reaches it over the shared `bossraid-evaluator-socket` volume
- the evaluator service runs from `BOSSRAID_EVALUATOR_IMAGE`, mounts the Docker socket, and launches each runtime probe in its own disposable job container from `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`

## Publish Image

The repo now includes [docker-image.yml](/Users/area/Desktop/boss-raid/.github/workflows/docker-image.yml), which publishes `ghcr.io/<owner>/boss-raid`, `ghcr.io/<owner>/boss-raid-evaluator`, and `ghcr.io/<owner>/boss-raid-evaluator-job` on `main`, tags, and manual dispatch.

If you want to publish manually instead:

```bash
pnpm docker:build
docker tag bossraid:local ghcr.io/<owner>/boss-raid:latest
docker tag bossraid-evaluator:local ghcr.io/<owner>/boss-raid-evaluator:latest
docker tag bossraid-evaluator-job:local ghcr.io/<owner>/boss-raid-evaluator-job:latest
docker push ghcr.io/<owner>/boss-raid:latest
docker push ghcr.io/<owner>/boss-raid-evaluator:latest
docker push ghcr.io/<owner>/boss-raid-evaluator-job:latest
```

## Phala CVM

Phala Cloud supports multi-service Docker Compose deployments inside one CVM. The official guide is:

- [Deploy CVM with Docker Compose](https://docs.phala.network/phala-cloud/phala-cloud-user-guides/create-cvm/create-with-docker-compose)

Recommended deployment steps:

1. Publish the Docker images to a registry Phala can pull from, such as GHCR.
2. Copy [deploy/phala/.env.example](/Users/area/Desktop/boss-raid/deploy/phala/.env.example) to a private env file and replace the placeholder values.
3. Set `BOSSRAID_IMAGE`, `BOSSRAID_EVALUATOR_IMAGE`, and `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE` to the published tags.
4. Keep `BOSSRAID_EVAL_RUNTIME_EXECUTION=true`, `BOSSRAID_EVAL_SANDBOX_MODE=socket`, and `BOSSRAID_EVAL_ALLOW_UNSAFE_HOST_EXECUTION=false`.
5. Keep `BOSSRAID_TEE_SOCKET_PATH=/var/run/tappd.sock` unless your CVM exposes a different socket path.
6. In the Phala dashboard, deploy [deploy/phala/docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/docker-compose.yml) as the CVM compose file.
7. Expose only the gateway port `8080`.

## Provider-Only CVM

If Boss Raid control-plane traffic already lives on EigenCompute, repurpose the Phala CVM into a provider-only worker fleet instead of running a second gateway and API.

Use:

- [deploy/phala/providers-only.docker-compose.yml](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.docker-compose.yml)
- [deploy/phala/providers-only.env.example](/Users/area/Desktop/boss-raid/deploy/phala/providers-only.env.example)

Recommended steps:

1. Keep the existing provider model credentials and provider tokens in the CVM env.
2. Set `BOSSRAID_CALLBACK_BASE` to the live Boss Raid API base, for example `http://34.59.138.65:8080/api` for the current EigenCompute deployment.
3. Update the existing CVM with the provider-only compose file.
4. Expose provider ports `9001`, `9002`, and `9003`.
5. Point the EigenCompute provider manifest at the resulting public Phala URLs.

Public provider URLs follow the Phala port pattern:

- `https://<phala-app-id>-9001.<gateway-domain>`
- `https://<phala-app-id>-9002.<gateway-domain>`
- `https://<phala-app-id>-9003.<gateway-domain>`

Operational notes for provider-only mode:

- each provider keeps bearer auth enabled on `/v1/raid/accept`
- `/health` stays public and is what the Boss Raid control plane probes
- provider callbacks still use the provider token as the callback bearer
- `BOSSRAID_CALLBACK_BASE` should point at the public gateway API prefix, usually `http://<eigen-ip>:8080/api`; provider callbacks now preserve that base pathname when posting heartbeat, submit, and failure events

Required env:

- `BOSSRAID_IMAGE`
- `BOSSRAID_EVALUATOR_IMAGE`
- `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`
- `BOSSRAID_ADMIN_TOKEN`
- `BOSSRAID_TEE_SOCKET_PATH`
- `BOSSRAID_EVAL_SANDBOX_TOKEN`
- `BOSSRAID_MODEL_API_KEY`
- `BOSSRAID_MODEL`
- `BOSSRAID_PROVIDER_A_TOKEN`
- `BOSSRAID_PROVIDER_B_TOKEN`
- `BOSSRAID_PROVIDER_C_TOKEN`

Optional env:

- x402 facilitator and payout env for the default paid public route posture, or `BOSSRAID_X402_ENABLED=false` if you want unpaid private ingress
- evaluator abuse limits if you want stricter caps than the defaults
- `BOSSRAID_EVAL_JOB_ISOLATION`
- `BOSSRAID_DOCKER_SOCKET_SOURCE`
- `BOSSRAID_DOCKER_SOCKET_GID`
- `BOSSRAID_EVAL_MAX_CONCURRENT_JOBS`
- `BOSSRAID_EVAL_JOB_TIMEOUT_MS`
- `BOSSRAID_EVAL_MAX_FILES`
- `BOSSRAID_EVAL_MAX_TOTAL_BYTES`
- `BOSSRAID_EVAL_MAX_FILE_BYTES`
- `BOSSRAID_EVAL_MAX_PATH_LENGTH`
- `BOSSRAID_X402_ENABLED`
- `BOSSRAID_X402_NETWORK`
- `BOSSRAID_X402_ASSET`
- `BOSSRAID_X402_PAY_TO`
- `BOSSRAID_X402_RESOURCE_BASE_URL`
- `BOSSRAID_X402_VERIFY_HMAC_SECRET`
- `PAYAI_API_KEY_ID`
- `PAYAI_API_KEY_SECRET`

Public write routes are paid by default in this topology. If you keep that posture, set the x402 payout and facilitator env before exposing the gateway publicly. If you want an unpaid private deployment, set `BOSSRAID_X402_ENABLED=false` explicitly.

Operational notes:

- the gateway healthcheck hits the API through `/healthz`
- the API rate limiter should run with `BOSSRAID_TRUST_PROXY=true` in this topology so forwarded client IPs survive the gateway hop
- the Phala compose file mounts `${BOSSRAID_TEE_SOCKET_PATH}` into the API container and marks the deployment target as `phala-cvm`
- the evaluator service uses `network_mode: none`, listens on `/socket/evaluator.sock`, mounts the Docker socket for job launches, and rejects oversize/path-escaping requests before execution
- the disposable runtime probes launch from `BOSSRAID_EVAL_JOB_CONTAINER_IMAGE`, not the long-lived API or evaluator service images
- `GET /api/v1/runtime` with admin auth confirms the mounted TEE socket path, proxy mode, evaluator safety flags, and active storage backend after deploy
- provider ports remain private and are not published

## ACP Seller Runtimes

The ACP seller runtimes for `Gamma`, `Riko`, and `Dottie` use a separate Phala compose file and a shared ACP seller image.

See [docs/acp-seller-phala-deployment.md](/Users/area/Desktop/boss-raid/docs/acp-seller-phala-deployment.md) for the build, env export, registry push, and `phala deploy` flow.

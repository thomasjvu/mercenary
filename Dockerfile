FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@bossraid/api... --filter=@bossraid/evaluator... --filter=@bossraid/provider-agent... --filter=@bossraid/web... --filter=@bossraid/ops...

FROM docker:28-cli AS dockercli

FROM node:22-bookworm-slim AS runtime-base

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH
ENV HOME=/tmp

RUN groupadd --system --gid 10001 bossraid \
  && useradd --system --uid 10001 --gid bossraid --home-dir /app --shell /usr/sbin/nologin bossraid \
  && mkdir -p /app /data /socket /tmp \
  && chown -R bossraid:bossraid /app /data /socket /tmp
WORKDIR /app

FROM runtime-base AS app-runtime
COPY --from=build --chown=bossraid:bossraid /app /app

USER bossraid:bossraid

EXPOSE 8080 8787 9001 9002 9003

CMD ["node", "scripts/serve-gateway.mjs"]

FROM runtime-base AS evaluator-runtime

COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build --chown=bossraid:bossraid /app /app

USER bossraid:bossraid

EXPOSE 8790

CMD ["node", "apps/evaluator/dist/apps/evaluator/src/index.js"]

FROM runtime-base AS evaluator-job

COPY --from=build --chown=bossraid:bossraid /app/apps/evaluator/package.json /app/apps/evaluator/package.json
COPY --from=build --chown=bossraid:bossraid /app/apps/evaluator/node_modules /app/apps/evaluator/node_modules
COPY --from=build --chown=bossraid:bossraid /app/apps/evaluator/dist /app/apps/evaluator/dist
COPY --from=build --chown=bossraid:bossraid /app/packages/shared-types/package.json /app/packages/shared-types/package.json
COPY --from=build --chown=bossraid:bossraid /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=build --chown=bossraid:bossraid /app/packages/provider-registry/package.json /app/packages/provider-registry/package.json
COPY --from=build --chown=bossraid:bossraid /app/packages/provider-registry/node_modules /app/packages/provider-registry/node_modules
COPY --from=build --chown=bossraid:bossraid /app/packages/provider-registry/dist /app/packages/provider-registry/dist
COPY --from=build --chown=bossraid:bossraid /app/packages/raid-core/package.json /app/packages/raid-core/package.json
COPY --from=build --chown=bossraid:bossraid /app/packages/raid-core/node_modules /app/packages/raid-core/node_modules
COPY --from=build --chown=bossraid:bossraid /app/packages/raid-core/dist /app/packages/raid-core/dist
COPY --from=build --chown=bossraid:bossraid /app/packages/sandbox-runner/package.json /app/packages/sandbox-runner/package.json
COPY --from=build --chown=bossraid:bossraid /app/packages/sandbox-runner/node_modules /app/packages/sandbox-runner/node_modules
COPY --from=build --chown=bossraid:bossraid /app/packages/sandbox-runner/dist /app/packages/sandbox-runner/dist

USER bossraid:bossraid

CMD ["node", "/app/apps/evaluator/dist/apps/evaluator/src/job-worker.js"]

FROM app-runtime AS runtime

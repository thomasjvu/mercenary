import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { verifyProviderAuth } from "@bossraid/provider-sdk";
import { callback, reportFailure } from "./callbacks.js";
import { getReadiness, providerConfig } from "./config.js";
import { requestModelSubmission } from "./model.js";
import type { AcceptBody } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function runProviderJob(
  app: ReturnType<typeof Fastify>,
  body: AcceptBody,
  providerRunId: string,
): Promise<void> {
  let heartbeatCount = 0;
  const heartbeatTimer = setInterval(() => {
    heartbeatCount += 1;
    const progress = Math.min(0.9, heartbeatCount * 0.15);
    void callback(`/v1/providers/${body.providerId}/heartbeat`, {
      raidId: body.raidId,
      providerRunId,
      progress,
      message: `${providerConfig.displayName} analyzing ${body.task.artifacts.files.length} file(s)`,
    }).catch((error) => {
      app.log.error(error);
    });
  }, providerConfig.heartbeatIntervalMs);

  try {
    const submission = await requestModelSubmission(body.task, body.deadlineUnix);
    clearInterval(heartbeatTimer);
    await callback(`/v1/providers/${body.providerId}/submit`, {
      raidId: body.raidId,
      providerRunId,
      patchUnifiedDiff: submission.patchUnifiedDiff,
      answerText: submission.answerText,
      artifacts: submission.artifacts,
      explanation: submission.explanation,
      confidence: submission.confidence,
      claimedRootCause: submission.claimedRootCause,
      contributionRole: submission.contributionRole,
      filesTouched: submission.filesTouched,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    clearInterval(heartbeatTimer);
    await reportFailure(app.log, body, providerRunId, error);
  }
}

export function buildProviderAgentServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => {
    const readiness = getReadiness();
    return {
      ok: readiness.ready,
      ready: readiness.ready,
      missing: readiness.missing,
      providerId: providerConfig.providerId,
      providerName: providerConfig.displayName,
      model: providerConfig.modelName ?? null,
    };
  });

  app.post("/v1/raid/accept", async (request, reply) => {
    if (
      !verifyProviderAuth({
      auth: providerConfig.providerAuth,
      providerId: providerConfig.providerId,
      method: request.method,
      path: request.url,
      body: JSON.stringify(request.body ?? {}),
      headers: request.headers,
      authorizationHeader: asSingleHeader(request.headers.authorization),
      timestampHeader: asSingleHeader(request.headers["x-bossraid-timestamp"]),
      signatureHeader: asSingleHeader(request.headers["x-bossraid-signature"]),
        providerIdHeader: asSingleHeader(request.headers["x-bossraid-provider-id"]),
      })
    ) {
      reply.code(401);
      return { error: "unauthorized" };
    }

    const readiness = getReadiness();
    if (!readiness.ready) {
      reply.code(503);
      return {
        error: "provider_not_ready",
        missing: readiness.missing,
      };
    }

    const body = request.body as AcceptBody;
    if (body.providerId !== providerConfig.providerId) {
      reply.code(400);
      return { error: "provider_mismatch" };
    }

    await sleep(providerConfig.acceptDelayMs);
    const providerRunId = `run_${randomUUID()}`;
    setImmediate(() => {
      void runProviderJob(app, body, providerRunId).catch((error) => {
        app.log.error(error);
      });
    });

    return {
      accepted: true,
      providerRunId,
    };
  });

  return app;
}

import type { FastifyBaseLogger } from "fastify";
import { buildProviderAuthHeaders } from "@bossraid/provider-sdk";
import { providerConfig } from "./config.js";
import type { AcceptBody } from "./types.js";

export function resolveCallbackUrl(path: string, callbackBase = providerConfig.callbackBase): string {
  const base = new URL(callbackBase);
  const normalizedBasePath = base.pathname.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  base.pathname = `${normalizedBasePath}${normalizedPath}` || "/";
  base.search = "";
  base.hash = "";
  return base.toString();
}

export async function callback(path: string, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  const response = await fetch(resolveCallbackUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...buildProviderAuthHeaders(
        providerConfig.callbackAuth,
        providerConfig.providerId,
        "POST",
        path,
        body,
      ),
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`callback failed (${response.status})`);
  }
}

export async function reportFailure(
  logger: FastifyBaseLogger,
  body: AcceptBody,
  providerRunId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(error);

  try {
    await callback(`/v1/providers/${body.providerId}/failure`, {
      raidId: body.raidId,
      providerRunId,
      message,
      failedAt: new Date().toISOString(),
    });
  } catch (callbackError) {
    logger.error(callbackError);
  }
}

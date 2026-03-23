type CatchallParam = string | string[] | undefined;

type PagesContext = {
  request: Request;
  env: {
    BOSSRAID_API_ORIGIN?: string;
  };
  params: {
    path?: CatchallParam;
  };
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const apiOrigin = normalizeApiOrigin(context.env.BOSSRAID_API_ORIGIN);
  if (!apiOrigin) {
    return jsonResponse(500, {
      error: "api_origin_not_configured",
      message: "Cloudflare Pages requires BOSSRAID_API_ORIGIN for the /api proxy.",
    });
  }

  let upstreamBase: URL;
  try {
    upstreamBase = new URL(apiOrigin);
  } catch {
    return jsonResponse(500, {
      error: "api_origin_invalid",
      message: "BOSSRAID_API_ORIGIN must be an absolute URL.",
    });
  }

  const requestUrl = new URL(context.request.url);
  const upstreamUrl = new URL(buildRelativePath(context.params.path, requestUrl.search), upstreamBase);
  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));

  const connectingIp = headers.get("cf-connecting-ip");
  if (connectingIp) {
    const existingForwardedFor = headers.get("x-forwarded-for");
    headers.set("x-forwarded-for", existingForwardedFor ? `${existingForwardedFor}, ${connectingIp}` : connectingIp);
  }

  return fetch(upstreamUrl, {
    method: context.request.method,
    headers,
    body: requestAllowsBody(context.request.method) ? context.request.body : undefined,
    redirect: "manual",
  });
}

function normalizeApiOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function buildRelativePath(path: CatchallParam, search: string): string {
  const segments = Array.isArray(path) ? path : typeof path === "string" ? [path] : [];
  const relativePath = segments.map((segment) => encodeURIComponent(segment)).join("/");
  return `${relativePath}${search}`;
}

function requestAllowsBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function jsonResponse(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

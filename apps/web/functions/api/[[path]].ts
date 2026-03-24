type CatchallParam = string | string[] | undefined;

type PagesContext = {
  request: Request;
  env: {
    BOSSRAID_API_ORIGIN?: string;
    BOSSRAID_DEMO_PROXY_TOKEN?: string;
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
  headers.delete("x-bossraid-demo-token");
  headers.set("x-forwarded-host", requestUrl.host);
  headers.set("x-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));
  rewriteX402PaymentRequestHeaders(headers);

  if (isDemoSpawnRequest(context.request.method, upstreamUrl.pathname)) {
    const demoProxyToken = context.env.BOSSRAID_DEMO_PROXY_TOKEN?.trim();
    if (demoProxyToken) {
      headers.set("x-bossraid-demo-token", demoProxyToken);
    }
  }

  const connectingIp = headers.get("cf-connecting-ip");
  if (connectingIp) {
    const existingForwardedFor = headers.get("x-forwarded-for");
    headers.set("x-forwarded-for", existingForwardedFor ? `${existingForwardedFor}, ${connectingIp}` : connectingIp);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: context.request.method,
    headers,
    body: requestAllowsBody(context.request.method) ? context.request.body : undefined,
    redirect: "manual",
  });

  return rewriteX402PaymentRequiredResponse(upstreamResponse, requestUrl);
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

function isDemoSpawnRequest(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== "POST") {
    return false;
  }

  return pathname.replace(/\/+$/, "") === "/api/v1/demo/raid" || pathname.replace(/\/+$/, "") === "/v1/demo/raid";
}

function jsonResponse(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

type X402PaymentRequired = {
  x402Version: number;
  accepts?: Array<Record<string, unknown>>;
};

async function rewriteX402PaymentRequiredResponse(response: Response, requestUrl: URL): Promise<Response> {
  if (response.status !== 402) {
    return response;
  }

  const encodedPaymentRequired = response.headers.get("payment-required");
  if (!encodedPaymentRequired) {
    return response;
  }

  let paymentRequired: X402PaymentRequired;
  try {
    paymentRequired = JSON.parse(atob(encodedPaymentRequired)) as X402PaymentRequired;
  } catch {
    return response;
  }

  const normalizedPaymentRequired = normalizePaymentRequired(paymentRequired, requestUrl);
  if (JSON.stringify(normalizedPaymentRequired) === JSON.stringify(paymentRequired)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("payment-required", btoa(JSON.stringify(normalizedPaymentRequired)));
  headers.delete("content-length");

  const contentType = headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (responseBody && typeof responseBody === "object" && "x402" in responseBody) {
    const bodyRecord = responseBody as Record<string, unknown>;
    bodyRecord.x402 = normalizedPaymentRequired;
  }

  return new Response(JSON.stringify(responseBody), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizePaymentRequired(paymentRequired: X402PaymentRequired, requestUrl: URL): X402PaymentRequired {
  const publicResourceUrl = new URL(requestUrl.pathname, requestUrl.origin).toString();
  return {
    ...paymentRequired,
    accepts: paymentRequired.accepts?.map((accept) => ({
      ...accept,
      network: normalizeX402Network(typeof accept.network === "string" ? accept.network : undefined),
      resource: publicResourceUrl,
    })),
  };
}

function normalizeX402Network(network: string | undefined): string | undefined {
  if (!network) {
    return network;
  }

  const aliases: Record<string, string> = {
    "eip155:1": "ethereum",
    "eip155:8453": "base",
    "eip155:84532": "base-sepolia",
    "eip155:11155111": "sepolia",
  };

  return aliases[network] ?? network;
}

function rewriteX402PaymentRequestHeaders(headers: Headers): void {
  const xPayment = headers.get("x-payment");
  if (!xPayment || headers.has("payment-signature")) {
    return;
  }

  headers.set("payment-signature", xPayment);
  headers.delete("x-payment");
}

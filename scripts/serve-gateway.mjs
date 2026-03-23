import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const host = process.env.BOSSRAID_GATEWAY_HOST ?? process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? "8080");
const apiOrigin = process.env.BOSSRAID_API_ORIGIN ?? "http://127.0.0.1:8787";
const webDistDir = resolve(process.cwd(), process.env.BOSSRAID_WEB_DIST_DIR ?? "apps/web/dist");
const opsDistDir = resolve(process.cwd(), process.env.BOSSRAID_OPS_DIST_DIR ?? "apps/ops/dist");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      await handleGatewayHealth(response);
      return;
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      await proxyRequest(request, response, pathname.replace(/^\/api/, "") || "/", url.search);
      return;
    }

    if (pathname === "/ops-api" || pathname.startsWith("/ops-api/")) {
      await proxyRequest(request, response, pathname.replace(/^\/ops-api/, "") || "/", url.search);
      return;
    }

    if (pathname === "/ops") {
      response.writeHead(308, { location: "/ops/" });
      response.end();
      return;
    }

    if (pathname.startsWith("/ops/")) {
      await serveSpaApp(response, opsDistDir, pathname.slice("/ops".length));
      return;
    }

    await serveSpaApp(response, webDistDir, pathname);
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      error: "gateway_error",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(port, host, () => {
  console.log(`Boss Raid gateway listening on http://${host}:${port}`);
});
registerShutdownHandlers();

async function handleGatewayHealth(response) {
  try {
    const upstream = await fetch(new URL("/health", apiOrigin), {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    const payload = await upstream.text();
    response.writeHead(upstream.ok ? 200 : 502, {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    });
    response.end(payload);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      ok: false,
      error: "api_unreachable",
      message: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function proxyRequest(request, response, upstreamPathname, search) {
  const target = new URL(`${upstreamPathname}${search}`, apiOrigin);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request);
  const headers = buildProxyRequestHeaders(request);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });

  const responseHeaders = Object.fromEntries(upstream.headers.entries());
  delete responseHeaders.connection;
  delete responseHeaders["content-length"];
  const setCookie =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : undefined;
  if (setCookie && setCookie.length > 0) {
    response.setHeader("set-cookie", setCookie);
  }
  for (const [key, value] of Object.entries(responseHeaders)) {
    response.setHeader(key, value);
  }
  response.statusCode = upstream.status;

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const arrayBuffer = await upstream.arrayBuffer();
  response.end(Buffer.from(arrayBuffer));
}

function buildProxyRequestHeaders(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    const normalized = normalizeHeaderValue(value);
    if (normalized != null) {
      headers[key] = normalized;
    }
  }
  delete headers.connection;
  delete headers.host;
  delete headers["content-length"];

  const remoteAddress = request.socket.remoteAddress ?? "";
  const forwardedFor = typeof headers["x-forwarded-for"] === "string" && headers["x-forwarded-for"].length > 0
    ? `${headers["x-forwarded-for"]}, ${remoteAddress}`
    : remoteAddress;

  return {
    ...headers,
    "x-forwarded-for": forwardedFor,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": "http",
  };
}

function normalizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return typeof value === "string" ? value : undefined;
}

async function serveSpaApp(response, rootDir, pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolveStaticPath(rootDir, relativePath);
  if (filePath) {
    const file = await readFile(filePath).catch(() => undefined);
    if (file) {
      writeFileResponse(response, filePath, file);
      return;
    }
  }

  if (extname(relativePath)) {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  const indexPath = resolve(rootDir, "index.html");
  const indexFile = await readFile(indexPath);
  writeFileResponse(response, indexPath, indexFile);
}

function resolveStaticPath(rootDir, relativePath) {
  const normalizedRoot = resolve(rootDir);
  const cleaned = decodeURIComponent(relativePath).replace(/^\/+/, "");
  const resolvedPath = resolve(normalizedRoot, cleaned);
  if (resolvedPath === normalizedRoot || resolvedPath.startsWith(`${normalizedRoot}${sep}`)) {
    return resolvedPath;
  }
  return undefined;
}

function writeFileResponse(response, filePath, content) {
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "cache-control": filePath.endsWith(".html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  response.end(content);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function registerShutdownHandlers() {
  let closing = false;

  const shutdown = (signal) => {
    if (closing) {
      return;
    }
    closing = true;
    console.log(`Shutting down Boss Raid gateway after ${signal}`);
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exit(1);
        return;
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

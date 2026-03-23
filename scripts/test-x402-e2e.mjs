import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const args = parseArgs(process.argv.slice(2));
if (args.has("help")) {
  console.log([
    "Usage:",
    "  pnpm test:x402:e2e -- --mode hmac --route raid",
    "  pnpm test:x402:e2e -- --mode wallet --route raid",
    "",
    "Options:",
    "  --mode hmac|wallet",
    "  --route raid|chat",
    "  --api-base <url>",
    "  --payload-file <path>",
  ].join("\n"));
  process.exit(0);
}
const route = readStringArg(args, "route") ?? process.env.BOSSRAID_X402_E2E_ROUTE ?? "raid";
const mode =
  readStringArg(args, "mode") ??
  process.env.BOSSRAID_X402_E2E_MODE ??
  (process.env.BOSSRAID_X402_VERIFY_HMAC_SECRET ? "hmac" : "wallet");
const apiBase =
  readStringArg(args, "api-base") ??
  process.env.BOSSRAID_X402_E2E_API_BASE ??
  process.env.BOSSRAID_API_BASE ??
  process.env.VITE_BOSSRAID_API_BASE ??
  "http://127.0.0.1:8787";
const payloadFile =
  readStringArg(args, "payload-file") ?? resolve(rootDir, defaultPayloadForRoute(route));

if (route !== "raid" && route !== "chat") {
  throw new Error(`Unsupported --route "${route}". Use "raid" or "chat".`);
}

if (mode !== "hmac" && mode !== "wallet") {
  throw new Error(`Unsupported --mode "${mode}". Use "hmac" or "wallet".`);
}

if (!existsSync(payloadFile)) {
  throw new Error(`Payload file not found: ${payloadFile}`);
}

const url = new URL(route === "chat" ? "/v1/chat/completions" : "/v1/raid", apiBase);
const payload = JSON.parse(readFileSync(payloadFile, "utf8"));

console.log(
  JSON.stringify(
    {
      step: "start",
      route,
      mode,
      url: url.toString(),
      payloadFile,
    },
    null,
    2,
  ),
);

const challengeResponse = await fetchJson(url, payload);
if (challengeResponse.status === 409) {
  throw new Error(
    `Preflight failed before payment. The API reported no eligible providers: ${JSON.stringify(challengeResponse.body)}`,
  );
}
if (challengeResponse.status !== 402) {
  throw new Error(
    `Expected 402 challenge from ${url}, got ${challengeResponse.status}: ${JSON.stringify(challengeResponse.body)}`,
  );
}

const paymentRequiredHeader = challengeResponse.headers.get("payment-required");
if (!paymentRequiredHeader) {
  throw new Error("Missing PAYMENT-REQUIRED header on 402 response.");
}

const paymentRequired = decodeBase64Json(paymentRequiredHeader);
console.log(
  JSON.stringify(
    {
      step: "challenge",
      paymentRequired,
    },
    null,
    2,
  ),
);

const paidResponse = mode === "hmac"
  ? await runHmacPayment(url, payload, paymentRequired)
  : await runWalletPayment(url, payload);

const paymentResponseHeader = paidResponse.headers.get("payment-response");
const settlement = paymentResponseHeader ? decodePaymentResponseHeader(paymentResponseHeader) : undefined;
const responseText = await paidResponse.text();
const responseBody = tryParseJson(responseText);

if (!paidResponse.ok) {
  throw new Error(
    `Paid request failed with ${paidResponse.status}: ${
      typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)
    }`,
  );
}

if (!paymentResponseHeader) {
  throw new Error("Paid response succeeded but did not include PAYMENT-RESPONSE.");
}

console.log(
  JSON.stringify(
    {
      step: "success",
      status: paidResponse.status,
      settlement,
      body: responseBody,
    },
    null,
    2,
  ),
);

async function runHmacPayment(url, payload, paymentRequired) {
  const secret = process.env.BOSSRAID_X402_VERIFY_HMAC_SECRET;
  if (!secret) {
    throw new Error("BOSSRAID_X402_VERIFY_HMAC_SECRET is required for --mode hmac.");
  }

  const requirement = paymentRequired.accepts?.[0];
  if (!requirement) {
    throw new Error("PAYMENT-REQUIRED did not include any accepted payment requirements.");
  }

  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(requirement))
    .digest("hex");

  return fetchJson(url, payload, {
    "payment-signature": encodeBase64Json({
      requirement,
      signature,
      payer: "bossraid-e2e-hmac",
    }),
  });
}

async function runWalletPayment(url, payload) {
  const rawPrivateKey =
    process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY ?? process.env.EVM_PRIVATE_KEY;
  if (!rawPrivateKey) {
    throw new Error(
      "BOSSRAID_X402_BUYER_PRIVATE_KEY or EVM_PRIVATE_KEY is required for --mode wallet.",
    );
  }

  const account = privateKeyToAccount(normalizeHexPrivateKey(rawPrivateKey));
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:*",
        client: new ExactEvmScheme(account),
      },
    ],
  });

  return fetchWithPayment(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function fetchJson(url, payload, extraHeaders = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: tryParseJson(text),
  };
}

function defaultPayloadForRoute(route) {
  return route === "chat"
    ? "examples/chat-completion-request.json"
    : "examples/unity-bug/task.json";
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

function normalizeHexPrivateKey(value) {
  return value.startsWith("0x") ? value : `0x${value}`;
}

function tryParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseArgs(argv) {
  const options = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options.set(key, "true");
      continue;
    }

    options.set(key, next);
    index += 1;
  }

  return options;
}

function readStringArg(options, key) {
  const value = options.get(key);
  return value && value !== "true" ? value : undefined;
}

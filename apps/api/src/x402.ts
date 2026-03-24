import { createHmac, createPrivateKey, randomBytes, sign, timingSafeEqual } from "node:crypto";
import { createFacilitatorConfig as createPayAIFacilitatorConfig } from "@payai/facilitator";

export interface X402PaymentRequirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  price?: string;
  extra?: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | null;
}

export interface X402PaymentRequired {
  x402Version: 1;
  accepts: X402PaymentRequirement[];
  error?: string;
}

export interface X402SettlementResponse {
  success: boolean;
  error?: string;
  transaction?: string;
  network?: string;
  payer?: string;
}

export interface X402VerificationResponse {
  isValid?: boolean;
  valid?: boolean;
  success?: boolean;
  payer?: string;
  error?: string;
}

interface X402Config {
  enabled: boolean;
  facilitatorUrl?: string;
  resourceBaseUrl: string;
  network: string;
  asset: string;
  payTo: string;
  maxAmountRequired?: string;
  maxTimeoutSeconds: number;
  routeSurchargeUsd: {
    raid: number;
    chat: number;
  };
  verifyHmacSecret?: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  payaiApiKeyId?: string;
  payaiApiKeySecret?: string;
  assetName?: string;
  assetVersion?: string;
}

class X402ProtocolError extends Error {
  readonly statusCode: number;
  readonly paymentRequired: X402PaymentRequired;
  readonly settlement?: X402SettlementResponse;

  constructor(
    message: string,
    paymentRequired: X402PaymentRequired,
    statusCode = 402,
    settlement?: X402SettlementResponse,
  ) {
    super(message);
    this.name = "X402ProtocolError";
    this.statusCode = statusCode;
    this.paymentRequired = paymentRequired;
    this.settlement = settlement;
  }
}

type RawHeaders = Record<string, string | string[] | undefined>;

type X402RouteName = "raid" | "chat";

function asSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatUsdPrice(amountUsd: number): string {
  if (amountUsd >= 1) {
    if (Math.abs(amountUsd * 100 - Math.round(amountUsd * 100)) < 0.000001) {
      return `$${amountUsd.toFixed(2)}`;
    }

    if (Math.abs(amountUsd * 1_000 - Math.round(amountUsd * 1_000)) < 0.000001) {
      return `$${amountUsd.toFixed(3)}`;
    }

    return `$${amountUsd.toFixed(4)}`;
  }

  if (amountUsd >= 0.01) {
    return `$${amountUsd.toFixed(3)}`;
  }

  return `$${amountUsd.toFixed(4)}`;
}

function usdToAtomicUsdc(amountUsd: number): string {
  return String(Math.max(1, Math.round(amountUsd * 1_000_000)));
}

export function readX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  const enabled = env.BOSSRAID_X402_ENABLED == null ? true : parseBoolean(env.BOSSRAID_X402_ENABLED);
  const raidSurchargeUsd = readPositiveNumber(env.BOSSRAID_X402_RAID_PRICE_USD, 0.01);
  const chatSurchargeUsd = readPositiveNumber(env.BOSSRAID_X402_CHAT_PRICE_USD, 0.002);

  return {
    enabled,
    facilitatorUrl:
      env.BOSSRAID_X402_FACILITATOR_URL ??
      (env.BOSSRAID_X402_VERIFY_HMAC_SECRET ? undefined : "https://facilitator.payai.network"),
    resourceBaseUrl: env.BOSSRAID_X402_RESOURCE_BASE_URL ?? "http://127.0.0.1:8787",
    network: env.BOSSRAID_X402_NETWORK ?? "eip155:84532",
    asset: env.BOSSRAID_X402_ASSET ?? "usdc",
    payTo: env.BOSSRAID_X402_PAY_TO ?? "0x0000000000000000000000000000000000000000",
    maxAmountRequired: env.BOSSRAID_X402_MAX_AMOUNT_REQUIRED,
    maxTimeoutSeconds: Math.max(1, Math.round(readPositiveNumber(env.BOSSRAID_X402_MAX_TIMEOUT_SECONDS, 90))),
    routeSurchargeUsd: {
      raid: raidSurchargeUsd,
      chat: chatSurchargeUsd,
    },
    verifyHmacSecret: env.BOSSRAID_X402_VERIFY_HMAC_SECRET,
    cdpApiKeyId: env.CDP_API_KEY_ID,
    cdpApiKeySecret: env.CDP_API_KEY_SECRET,
    payaiApiKeyId: env.PAYAI_API_KEY_ID,
    payaiApiKeySecret: env.PAYAI_API_KEY_SECRET,
    assetName: env.BOSSRAID_X402_ASSET_NAME,
    assetVersion: env.BOSSRAID_X402_ASSET_VERSION,
  };
}

function encodeHeaderValue(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeHeaderValue<T>(value: string | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing ${label} header.`);
  }

  try {
    const json = Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(
      `${label} header did not contain valid base64 JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildResourceUrl(resourceBaseUrl: string, resourcePath: string): string {
  const baseUrl = new URL(resourceBaseUrl);
  baseUrl.pathname = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  baseUrl.search = "";
  baseUrl.hash = "";
  return new URL(resourcePath.replace(/^\/+/, ""), baseUrl).toString();
}

function formatPaymentRequirementNetwork(network: string): string {
  const v1Aliases: Record<string, string> = {
    "eip155:1": "ethereum",
    "eip155:8453": "base",
    "eip155:84532": "base-sepolia",
    "eip155:11155111": "sepolia",
  };

  return v1Aliases[network] ?? network;
}

function buildPaymentRequired(
  config: X402Config,
  route: X402RouteName,
  budgetUsd = 0,
  options: {
    extra?: Record<string, unknown>;
    maxTimeoutSeconds?: number;
  } = {},
): X402PaymentRequired {
  const resourcePath = route === "chat" ? "/v1/chat/completions" : "/v1/raid";
  const priceUsd = computeChargeUsd(config, route, budgetUsd);
  const assetConfig = resolveAssetConfig(config);

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: formatPaymentRequirementNetwork(config.network),
        maxAmountRequired:
          route === "raid" && config.maxAmountRequired && budgetUsd <= 0
            ? config.maxAmountRequired
            : usdToAtomicUsdc(priceUsd),
        resource: buildResourceUrl(config.resourceBaseUrl, resourcePath),
        description:
          route === "chat"
            ? "Boss Raid chat completion request"
            : "Boss Raid native raid request",
        mimeType: "application/json",
        payTo: config.payTo,
        maxTimeoutSeconds: options.maxTimeoutSeconds ?? config.maxTimeoutSeconds,
        asset: assetConfig.asset,
        price: formatUsdPrice(priceUsd),
        extra:
          assetConfig.extra || options.extra
            ? {
                ...(assetConfig.extra ?? {}),
                ...(options.extra ?? {}),
              }
            : undefined,
      },
    ],
  };
}

export function buildX402PaymentRequired(input: {
  route: X402RouteName;
  env?: NodeJS.ProcessEnv;
  budgetUsd?: number;
  extra?: Record<string, unknown>;
  maxTimeoutSeconds?: number;
}): X402PaymentRequired {
  const config = readX402Config(input.env);
  return buildPaymentRequired(config, input.route, input.budgetUsd ?? 0, {
    extra: input.extra,
    maxTimeoutSeconds: input.maxTimeoutSeconds,
  });
}

function computeChargeUsd(
  config: X402Config,
  route: X402RouteName,
  budgetUsd: number,
): number {
  const surchargeUsd = config.routeSurchargeUsd[route];
  const normalizedBudget = Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : 0;
  return normalizedBudget + surchargeUsd;
}

function resolveAssetConfig(config: X402Config): {
  asset: string;
  extra?: Record<string, unknown>;
} {
  const lowerAsset = config.asset.toLowerCase();
  const overrideExtra =
    config.assetName || config.assetVersion
      ? {
          ...(config.assetName ? { name: config.assetName } : {}),
          ...(config.assetVersion ? { version: config.assetVersion } : {}),
        }
      : undefined;

  if (config.asset.startsWith("0x")) {
    return {
      asset: config.asset,
      extra: overrideExtra,
    };
  }

  if (!config.network.startsWith("eip155:")) {
    return {
      asset: config.asset,
      extra: overrideExtra,
    };
  }

  if (lowerAsset !== "usdc") {
    throw new Error(
      "For EVM x402 routes, BOSSRAID_X402_ASSET must be 'usdc' or an ERC-20 token address.",
    );
  }

  const defaultUsdcByNetwork: Record<string, { asset: string; extra: Record<string, string> }> = {
    "eip155:8453": {
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      extra: {
        name: "USD Coin",
        version: "2",
      },
    },
    "eip155:84532": {
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      extra: {
        name: "USDC",
        version: "2",
      },
    },
  };

  const resolved = defaultUsdcByNetwork[config.network];
  if (!resolved) {
    throw new Error(
      `No built-in x402 asset metadata is configured for ${config.network}. Set BOSSRAID_X402_ASSET to a token address and provide BOSSRAID_X402_ASSET_NAME/BOSSRAID_X402_ASSET_VERSION if needed.`,
    );
  }

  return {
    asset: resolved.asset,
    extra: overrideExtra ?? resolved.extra,
  };
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function encodeJwtSegment(value: unknown): string {
  return base64UrlEncode(JSON.stringify(value));
}

function normalizePemSecret(secret: string): string {
  return secret.includes("\\n") ? secret.replace(/\\n/g, "\n") : secret;
}

function isLikelyPemPrivateKey(secret: string): boolean {
  return secret.includes("BEGIN");
}

function isLikelyEd25519Secret(secret: string): boolean {
  try {
    return Buffer.from(secret, "base64").length === 64;
  } catch {
    return false;
  }
}

function isCdpFacilitator(config: X402Config): boolean {
  if (!config.facilitatorUrl) {
    return false;
  }

  return new URL(config.facilitatorUrl).host === "api.cdp.coinbase.com";
}

function isPayAIFacilitator(config: X402Config): boolean {
  if (!config.facilitatorUrl) {
    return false;
  }

  return new URL(config.facilitatorUrl).host === "facilitator.payai.network";
}

function createEd25519PrivateKey(secret: string) {
  const decoded = Buffer.from(secret, "base64");
  if (decoded.length !== 64) {
    throw new Error("CDP Ed25519 API key secret must be 64 bytes after base64 decoding.");
  }

  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  return createPrivateKey({
    key: {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
      x: publicKey.toString("base64url"),
    },
    format: "jwk",
  });
}

function buildCdpBearerToken(config: X402Config, requestUrl: URL, method: string): string {
  if (!config.cdpApiKeyId || !config.cdpApiKeySecret) {
    throw new Error(
      "Coinbase CDP facilitator requires CDP_API_KEY_ID and CDP_API_KEY_SECRET.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 120;
  const payload = {
    sub: config.cdpApiKeyId,
    iss: "cdp",
    aud: ["cdp_service"],
    uris: [`${method.toUpperCase()} ${requestUrl.host}${requestUrl.pathname}${requestUrl.search}`],
    iat: now,
    nbf: now,
    exp: now + expiresIn,
  };
  const nonce = randomBytes(16).toString("hex");
  const normalizedSecret = normalizePemSecret(config.cdpApiKeySecret);
  const signingInput = [
    encodeJwtSegment({
      alg: isLikelyPemPrivateKey(normalizedSecret) ? "ES256" : "EdDSA",
      kid: config.cdpApiKeyId,
      typ: "JWT",
      nonce,
    }),
    encodeJwtSegment(payload),
  ].join(".");

  let signature: Buffer;
  if (isLikelyPemPrivateKey(normalizedSecret)) {
    signature = sign("sha256", Buffer.from(signingInput), {
      key: createPrivateKey(normalizedSecret),
      dsaEncoding: "ieee-p1363",
    });
  } else if (isLikelyEd25519Secret(normalizedSecret)) {
    signature = sign(null, Buffer.from(signingInput), createEd25519PrivateKey(normalizedSecret));
  } else {
    throw new Error(
      "Unsupported CDP_API_KEY_SECRET format. Use a PEM EC private key or a base64 Ed25519 secret.",
    );
  }

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function safeEqual(value: string, expected: string): boolean {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function verifyLocalPayment(
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired,
  secret: string | undefined,
): X402VerificationResponse {
  if (!secret) {
    return {
      valid: false,
      error: "Missing BOSSRAID_X402_VERIFY_HMAC_SECRET for local x402 verification.",
    };
  }

  const payload = decodeHeaderValue<{ requirement: X402PaymentRequirement; signature: string; payer?: string }>(
    signatureHeader,
    "PAYMENT-SIGNATURE",
  );
  const requirement = paymentRequired.accepts[0];
  if (!payload.requirement || !payload.signature) {
    return {
      valid: false,
      error: "Local payment signature payload must include requirement and signature.",
    };
  }

  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(requirement))
    .digest("hex");
  if (!safeEqual(payload.signature, expected)) {
    return {
      valid: false,
      error: "Local payment signature did not match the required payment payload.",
    };
  }

  return {
    valid: true,
    payer: payload.payer ?? "local-hmac-buyer",
  };
}

async function facilitatorRequest<TResponse>(
  config: X402Config,
  path: string,
  body: unknown,
): Promise<TResponse> {
  if (!config.facilitatorUrl) {
    throw new Error("BOSSRAID_X402_FACILITATOR_URL is required when x402 is enabled.");
  }

  const baseUrl = new URL(config.facilitatorUrl);
  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }
  const requestUrl = new URL(path.replace(/^\/+/, ""), baseUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (isCdpFacilitator(config)) {
    headers.authorization = `Bearer ${buildCdpBearerToken(config, requestUrl, "POST")}`;
  } else if (isPayAIFacilitator(config)) {
    const authHeaders = await createPayAIFacilitatorConfig(
      config.payaiApiKeyId,
      config.payaiApiKeySecret,
    ).createAuthHeaders?.();
    const endpoint = path.replace(/^\/+/, "") === "settle" ? "settle" : "verify";
    Object.assign(headers, authHeaders?.[endpoint] ?? {});
  }

  const response = await fetch(requestUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = {} as TResponse;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as TResponse;
    } catch (error) {
      throw new Error(
        `x402 facilitator ${path} returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (!response.ok) {
    throw new Error(
      `x402 facilitator ${path} failed (${response.status})${
        text.length > 0 ? `: ${text}` : ""
      }`,
    );
  }
  return payload;
}

async function verifyPayment(
  config: X402Config,
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired,
): Promise<X402VerificationResponse> {
  if (config.facilitatorUrl) {
    const paymentPayload = decodeHeaderValue<unknown>(signatureHeader, "PAYMENT-SIGNATURE");
    return facilitatorRequest<X402VerificationResponse>(config, "/verify", {
      x402Version: 1,
      paymentPayload,
      paymentRequirements: paymentRequired.accepts[0],
    });
  }

  return verifyLocalPayment(signatureHeader, paymentRequired, config.verifyHmacSecret);
}

async function settlePayment(
  config: X402Config,
  signatureHeader: string | undefined,
  paymentRequired: X402PaymentRequired,
): Promise<X402SettlementResponse> {
  if (config.facilitatorUrl) {
    const paymentPayload = decodeHeaderValue<unknown>(signatureHeader, "PAYMENT-SIGNATURE");
    return facilitatorRequest<X402SettlementResponse>(config, "/settle", {
      x402Version: 1,
      paymentPayload,
      paymentRequirements: paymentRequired.accepts[0],
    });
  }

  const verification = verifyLocalPayment(signatureHeader, paymentRequired, config.verifyHmacSecret);
  return {
    success: verification.valid === true,
    error: verification.valid === true ? undefined : verification.error,
    payer: verification.payer,
    network: paymentRequired.accepts[0]?.network,
    transaction: verification.valid === true ? "local-hmac-settlement" : undefined,
  };
}

export function applyX402Headers(reply: { header(name: string, value: string): unknown }, input: {
  paymentRequired?: X402PaymentRequired;
  settlement?: X402SettlementResponse;
}): void {
  if (input.paymentRequired) {
    reply.header("PAYMENT-REQUIRED", encodeHeaderValue(input.paymentRequired));
  }
  if (input.settlement) {
    reply.header("PAYMENT-RESPONSE", encodeHeaderValue(input.settlement));
  }
}

export async function requireX402Payment(input: {
  route: X402RouteName;
  headers: RawHeaders;
  env?: NodeJS.ProcessEnv;
  budgetUsd?: number;
  paymentRequired?: X402PaymentRequired;
}): Promise<{
  settlement?: X402SettlementResponse;
  paymentRequired?: X402PaymentRequired;
}> {
  const config = readX402Config(input.env);
  if (!config.enabled) {
    return {};
  }

  const paymentRequired = input.paymentRequired ?? buildPaymentRequired(config, input.route, input.budgetUsd ?? 0);
  const signatureHeader = asSingleHeader(input.headers["payment-signature"]);
  if (!signatureHeader) {
    throw new X402ProtocolError("Payment required.", paymentRequired);
  }

  const verification = await verifyPayment(config, signatureHeader, paymentRequired);
  const isValid = verification.isValid ?? verification.valid ?? verification.success;
  if (!isValid) {
    throw new X402ProtocolError(
      verification.error ?? "Payment verification failed.",
      {
        ...paymentRequired,
        error: verification.error ?? "payment_verification_failed",
      },
    );
  }

  const settlement = await settlePayment(config, signatureHeader, paymentRequired);
  if (!settlement.success) {
    throw new X402ProtocolError(
      settlement.error ?? "Payment settlement failed.",
      {
        ...paymentRequired,
        error: settlement.error ?? "payment_settlement_failed",
      },
      402,
      settlement,
    );
  }

  return {
    settlement,
    paymentRequired,
  };
}

export function isX402ProtocolError(error: unknown): error is X402ProtocolError {
  return error instanceof X402ProtocolError;
}

export function readX402ReservationId(
  headers: RawHeaders,
  headerName = "x-bossraid-launch-reservation",
): string | undefined {
  const explicitHeader = asSingleHeader(headers[headerName]);
  if (explicitHeader) {
    return explicitHeader;
  }

  const signatureHeader = asSingleHeader(headers["payment-signature"]);
  if (!signatureHeader) {
    return undefined;
  }

  try {
    const payload = decodeHeaderValue<{
      requirement?: {
        extra?: Record<string, unknown>;
      };
    }>(signatureHeader, "PAYMENT-SIGNATURE");
    const reservationId = payload.requirement?.extra?.reservationId;
    return typeof reservationId === "string" ? reservationId : undefined;
  } catch {
    return undefined;
  }
}

export {
  MODEL_BENCHMARK_TASK_USD,
  MODEL_BENCHMARK_INPUT_PER_1M_USD,
  MODEL_BENCHMARK_OUTPUT_PER_1M_USD,
  estimateBenchmarkTaskUsd,
  estimateBenchmarkPriceUsd,
  computeSavingsUsd,
  computeSavingsPercent,
} from './marketplace-benchmark.js';

export {
  INFERENCE_MODEL_CATALOG,
  listInferenceCatalogModelIds,
  type InferenceCatalogEntry,
} from './inference-catalog.js';

export {
  CATALOG_BENCHMARK_TASK_USD,
  CATALOG_BENCHMARK_INPUT_PER_1M_USD,
  CATALOG_BENCHMARK_OUTPUT_PER_1M_USD,
} from './inference-catalog-benchmark.js';

export {
  parseBoolean,
  readBooleanEnv,
  readPositiveInteger,
  readPositiveNumber,
  readStorageBackend,
  type ReadStorageBackendOptions,
  type StorageBackend,
} from './env.js';

export {
  DEFAULT_SETTLEMENT_MIN_PAYOUT_USD,
  INFERENCE_SETTLEMENT_MIN_PAYOUT_USD,
  readSettlementMinPayoutUsd,
  readSettlementMode,
} from './settlement.js';

// Network Constants
export const NETWORK = {
  LOCALHOST: '127.0.0.1',
  LOCAL_API_PORT: 8787,
  LOCAL_WEB_PORT: 4173,
  LOCAL_OPS_PORT: 4174,
  LOCAL_PROVIDER_BASE_PORT: 9001,
  TEST_PROVIDER_PORT_START: 9000,
  TEST_ORCHESTRATOR_PORT: 9005,

  // Computed properties
  get LOCAL_API_BASE_URL() {
    return `http://${this.LOCALHOST}:${this.LOCAL_API_PORT}`;
  },
};

// Timeout Constants (in milliseconds)
export const TIMEOUTS = {
  PROVIDER_HEALTH_CACHE_TTL: 5_000,
  RAID_POLL_INTERVAL: 250,
  STALE_RESERVATION: 15 * 60 * 1_000, // 15 minutes
  DEFAULT_ESTIMATED_FIRST_RESULT_SEC: 25,
  ACTION_REQUEST: 20_000, // 20 seconds
  DELEGATE_TIMEOUT: 20_000, // 20 seconds
  VENICE_TIMEOUT: 20_000, // 20 seconds
  RUBRIC_TIMEOUT: 20_000, // 20 seconds
  CHAT_TERMINAL_SETTLE_GRACE_FLOOR_MS: 5_000,
  CHAT_TERMINAL_SETTLE_GRACE_CAP_MS: 30_000,
  MIN_TIMEOUT_MS: 1_000, // Minimum timeout value
};

// Adaptive Planning Constants
export const ADAPTIVE_PLANNING = {
  MIN_EXPERTS_FOR_RESERVES: 6,
  MAX_ADAPTIVE_RESERVES: 4,
  RESERVE_RATIO: 5,
  MAX_REVISIONS_PER_WORKSTREAM: 2,
  WEAK_SCORE_THRESHOLD: 0.72,
  EXPANSION_MISSING_CAP: 3,
  EXPANSION_WEAK_CAP: 2,
  MIN_EXPANSION_TO_TRIGGER: 2,
};

// Raid lifecycle
export const TERMINAL_RAID_STATUSES = new Set(['final', 'cancelled', 'expired']);

export function isTerminalRaidStatus(status: string | undefined): boolean {
  return status != null && TERMINAL_RAID_STATUSES.has(status);
}

// Default Values
export const DEFAULTS = {
  API_BODY_LIMIT_BYTES: 524_288, // 512 KB
  PROVIDER_SUBMISSION_BODY_LIMIT_MULTIPLIER: 8, // 8x API body limit
  OPS_SESSION_TTL_SEC: 43_200, // 12 hours
  PUBLIC_RATE_LIMIT_MAX: 60,
  PUBLIC_RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute
  OPS_SESSION_RATE_LIMIT_MAX: 10,
  OPS_SESSION_RATE_LIMIT_WINDOW_MS: 300_000, // 5 minutes
  PROVIDER_HEALTH_TIMEOUT_MS: 5_000,
  EVAL_MAX_CONCURRENT_JOBS: 2,
  EVAL_JOB_TIMEOUT_MS: 45_000,
  BATCH_SIZE_MB: 10, // 10 MB
  BYTES_PER_MB: 1_048_576, // 1024 * 1024
  GET_LOGS_BATCH_SIZE: 1000,
  GET_LOGS_OVERLAP: 100,
  SETTLEMENT_JOB_EXPIRY_SEC: 86_400, // 24 hours
  PROVIDER_FRESH_MS: 60_000,
  SANDBOX_TIMEOUT_MS: 30_000,
  PROVIDER_HEALTH_TIMEOUT: 5_000,
  PROVIDER_ACCEPT_TIMEOUT: 20_000,
  BUYER_PURCHASE_LIST_LIMIT: 100,
  SELLER_PAYOUT_LIST_LIMIT: 500,
  PUBLIC_AUTH_NONCE_TTL_SEC: 300,
};

// HTTP Constants
export const HTTP = {
  CONTENT_TYPE_JSON: 'application/json',
  AUTH_HEADER: 'authorization',
  PAYMENT_SIGNATURE_HEADER: 'payment-signature',
  BOSSRAID_TIMESTAMP_HEADER: 'x-bossraid-timestamp',
  BOSSRAID_PROVIDER_ID_HEADER: 'x-bossraid-provider-id',
  BOSSRAID_DEMO_TOKEN_HEADER: 'x-bossraid-demo-token',
  BOSSRAID_LAUNCH_RESERVATION_HEADER: 'x-bossraid-launch-reservation',
  BOSSRAID_RAID_TOKEN_HEADER: 'x-bossraid-raid-token',
  BOSSRAID_OPS_SESSION_COOKIE: 'bossraid_ops_session',
};

// API Route Constants
export const API_ROUTES = {
  V1_RAID: '/v1/raid',
  V1_RAIDS: '/v1/raids',
  V1_CHAT_COMPLETIONS: '/v1/chat/completions',
  V1_DEMO_RAID: '/v1/demo/raid',
  V1_AGENT_JSON: '/v1/agent.json',
  V1_ATTESTED_RUNTIME: '/v1/attested-runtime',
  V1_RUNTIME: '/v1/runtime',
  V1_OPS_SESSION: '/v1/ops/session',
  V1_OPS_METRICS: '/v1/ops/metrics',
  V1_OPS_PRODUCTION_READINESS: '/v1/ops/production-readiness',
  V1_OPS_SETTLEMENT_STATUS: '/v1/ops/settlement/status',
  V1_PROVIDERS: '/v1/providers',
  V1_EVALUATIONS_REPLAY: '/v1/evaluations/:raidId/replay',
  AGENTS_REGISTER: '/agents/register',
  AGENTS_HEARTBEAT: '/agents/heartbeat',
  AGENTS_DISCOVER: '/agents/discover',
};

// Web Route Constants
export const WEB_ROUTES = {
  ROOT: '/',
  DEMO: '/demo',
  RAIDERS: '/raiders',
  RECEIPT: '/receipt',
};

// Ops Route Constants
export const OPS_ROUTES = {
  ROOT: '/ops/',
  API_ROOT: '/ops-api/',
};

// Settlement Constants
export const SETTLEMENT = {
  DEFAULT_PLATFORM_MARKUP_BPS: 100,
  DEFAULT_RAID_SURCHARGE_USD: 0.01,
  DEFAULT_CHAT_SURCHARGE_USD: 0.002,
  DEFAULT_MAX_TIMEOUT_SECONDS: 90,
};

// X402 Constants
export const X402 = {
  DEFAULT_PAYAI_FACILITATOR_URL: 'https://facilitator.payai.network',
  DEFAULT_CDP_FACILITATOR_URL: 'https://api.cdp.coinbase.com/platform/v2/x402',
  CDP_JWT_EXPIRES_IN_SEC: 120,
};

// TEE Constants
export const TEE = {
  DEFAULT_SOCKET_PATH: '/var/run/tappd.sock',
  DEFAULT_VENDOR: 'phala',
  DEFAULT_RUNTIME_MODE: 'phala-cvm',
};

// Miscellaneous Constants
export const MISC = {
  RAID_ACCESS_TOKEN_LENGTH: 24, // bytes for random access token
};

export const DEFAULT_TIMEOUTS = {
  inviteAcceptMs: 3_000,
  firstHeartbeatMs: 5_000,
  heartbeatStaleMs: 8_000,
  hardExecutionMs: 60_000,
  raidAbsoluteMs: 90_000,
  providerFreshMs: 60_000,
} as const;

export const DEFAULT_LIMITS = {
  maxExperts: 5,
  maxFiles: 20,
  maxPayloadBytes: 250_000,
  maxDiffLines: 300,
  maxLoc: 50_000,
  validThreshold: 0.55,
  duplicateSimilarityThreshold: 0.92,
} as const;

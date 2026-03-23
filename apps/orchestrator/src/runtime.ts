export interface RuntimeOptions {
  inviteAcceptMs: number;
  firstHeartbeatMs: number;
  heartbeatStaleMs: number;
  hardExecutionMs: number;
  raidAbsoluteMs: number;
  providerFreshMs: number;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timeoutReject(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export function readRuntimeOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<RuntimeOptions> {
  return {
    ...readEnvNumber(env, "BOSSRAID_INVITE_ACCEPT_MS", "inviteAcceptMs"),
    ...readEnvNumber(env, "BOSSRAID_FIRST_HEARTBEAT_MS", "firstHeartbeatMs"),
    ...readEnvNumber(env, "BOSSRAID_HEARTBEAT_STALE_MS", "heartbeatStaleMs"),
    ...readEnvNumber(env, "BOSSRAID_HARD_EXECUTION_MS", "hardExecutionMs"),
    ...readEnvNumber(env, "BOSSRAID_RAID_ABSOLUTE_MS", "raidAbsoluteMs"),
    ...readEnvNumber(env, "BOSSRAID_PROVIDER_FRESH_MS", "providerFreshMs"),
  };
}

function readEnvNumber<TKey extends keyof RuntimeOptions>(
  env: NodeJS.ProcessEnv,
  envKey: string,
  optionKey: TKey,
): Partial<RuntimeOptions> {
  const raw = env[envKey];
  if (!raw) {
    return {};
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive number for ${envKey}.`);
  }

  return {
    [optionKey]: parsed,
  } as Pick<RuntimeOptions, TKey>;
}

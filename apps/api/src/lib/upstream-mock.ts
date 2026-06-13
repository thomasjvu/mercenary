export function isVeniceUpstreamMock(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOSSRAID_UPSTREAM_MOCK === '1' || env.BOSSRAID_VENICE_MOCK === '1';
}

export function isUpstreamInferenceMock(env: NodeJS.ProcessEnv = process.env): boolean {
  return isVeniceUpstreamMock(env);
}

export function isUpstreamTeeMock(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BOSSRAID_UPSTREAM_TEE_MOCK === '1' || isUpstreamInferenceMock(env);
}

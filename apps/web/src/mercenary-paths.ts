import { API_BASE } from './api';

type RaidPathRun = {
  spawn: {
    raidId: string;
    raidAccessToken: string;
  };
};

export function buildAgentLogPath(run: RaidPathRun): string {
  return `${API_BASE}/v1/raid/${encodeURIComponent(run.spawn.raidId)}/agent_log.json?token=${encodeURIComponent(run.spawn.raidAccessToken)}`;
}

export function buildAttestedRuntimePath(): string {
  return `${API_BASE}/v1/attested-runtime`;
}

export function buildAttestedResultPath(run: RaidPathRun): string {
  return `${API_BASE}/v1/raid/${encodeURIComponent(run.spawn.raidId)}/attested-result?token=${encodeURIComponent(run.spawn.raidAccessToken)}`;
}

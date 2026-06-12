export type TestOrchestratorTiming = {
  inviteAcceptMs: number;
  firstHeartbeatMs: number;
  hardExecutionMs: number;
  raidAbsoluteMs: number;
};

export const FAST_TEST_TIMING: TestOrchestratorTiming = {
  inviteAcceptMs: 1_000,
  firstHeartbeatMs: 1_000,
  hardExecutionMs: 1_000,
  raidAbsoluteMs: 1_000,
};

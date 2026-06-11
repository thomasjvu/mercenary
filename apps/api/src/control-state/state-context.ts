import type { ApiControlStateSnapshot, ApiControlStateStore } from './types.js';

export class ControlStateContext {
  private workingSnapshot: ApiControlStateSnapshot | null = null;

  constructor(private readonly store: ApiControlStateStore) {}

  loadWorkingSnapshot(): ApiControlStateSnapshot {
    if (!this.workingSnapshot) {
      this.workingSnapshot = this.store.loadState();
    }
    return this.workingSnapshot;
  }

  readPrunedState(nowMs: number): { snapshot: ApiControlStateSnapshot; changed: boolean } {
    const snapshot = this.loadWorkingSnapshot();
    const nextSessions = snapshot.opsSessions.filter((entry) => entry.expiresAt > nowMs);
    const nextPublicAuthNonces = snapshot.publicAuthNonces.filter(
      (entry) => entry.expiresAt > nowMs
    );
    const nextPublicSessions = snapshot.publicSessions.filter((entry) => entry.expiresAt > nowMs);
    const nextRateLimits = snapshot.rateLimits.filter((entry) => entry.resetAt > nowMs);
    const changed =
      nextSessions.length !== snapshot.opsSessions.length ||
      nextPublicAuthNonces.length !== snapshot.publicAuthNonces.length ||
      nextPublicSessions.length !== snapshot.publicSessions.length ||
      nextRateLimits.length !== snapshot.rateLimits.length;

    if (!changed) {
      return { snapshot, changed: false };
    }

    snapshot.opsSessions = nextSessions;
    snapshot.publicAuthNonces = nextPublicAuthNonces;
    snapshot.publicSessions = nextPublicSessions;
    snapshot.rateLimits = nextRateLimits;
    return { snapshot, changed: true };
  }

  writeState(snapshot: ApiControlStateSnapshot): void {
    snapshot.savedAt = new Date().toISOString();
    this.workingSnapshot = snapshot;
    this.store.saveState(snapshot);
  }
}

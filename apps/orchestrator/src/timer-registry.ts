export class ProviderTimerRegistry {
  private readonly hardTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly firstHeartbeatTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly heartbeatStaleTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  setHardTimeout(raidId: string, providerId: string, ms: number, fn: () => void): void {
    this.clearAll(raidId, providerId);
    this.hardTimeouts.set(this.key(raidId, providerId), setTimeout(fn, ms));
  }

  setFirstHeartbeatTimeout(raidId: string, providerId: string, ms: number, fn: () => void): void {
    this.clearFirstHeartbeat(raidId, providerId);
    this.firstHeartbeatTimeouts.set(this.key(raidId, providerId), setTimeout(fn, ms));
  }

  setHeartbeatStaleTimeout(raidId: string, providerId: string, ms: number, fn: () => void): void {
    this.clearHeartbeatStale(raidId, providerId);
    this.heartbeatStaleTimeouts.set(this.key(raidId, providerId), setTimeout(fn, ms));
  }

  clearFirstHeartbeat(raidId: string, providerId: string): void {
    const key = this.key(raidId, providerId);
    const timer = this.firstHeartbeatTimeouts.get(key);
    if (timer) {
      clearTimeout(timer);
      this.firstHeartbeatTimeouts.delete(key);
    }
  }

  clearHeartbeatStale(raidId: string, providerId: string): void {
    const key = this.key(raidId, providerId);
    const timer = this.heartbeatStaleTimeouts.get(key);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatStaleTimeouts.delete(key);
    }
  }

  clearAll(raidId: string, providerId: string): void {
    const key = this.key(raidId, providerId);
    const hardTimeout = this.hardTimeouts.get(key);
    if (hardTimeout) {
      clearTimeout(hardTimeout);
      this.hardTimeouts.delete(key);
    }
    this.clearFirstHeartbeat(raidId, providerId);
    this.clearHeartbeatStale(raidId, providerId);
  }

  private key(raidId: string, providerId: string): string {
    return `${raidId}:${providerId}`;
  }
}

export class PersistenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceUnavailableError';
  }
}

export class PersistenceQueue {
  private queue: Promise<void> = Promise.resolve();
  private lastError?: Error;

  get lastPersistenceError(): Error | undefined {
    return this.lastError;
  }

  getHealth(): { healthy: boolean; lastError?: string } {
    if (this.lastError == null) {
      return { healthy: true };
    }

    return {
      healthy: false,
      lastError: this.lastError.message,
    };
  }

  enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        try {
          await task();
          this.lastError = undefined;
        } catch (error) {
          this.lastError = error instanceof Error ? error : new Error(String(error));
          console.error('Mercenary persistence error', error);
          throw this.lastError;
        }
      });
    return this.queue;
  }

  enqueueBestEffort(task: () => Promise<void>): void {
    void this.enqueue(task).catch(() => undefined);
  }

  assertWritable(): void {
    if (!this.lastError) {
      return;
    }

    throw new PersistenceUnavailableError(
      `Mercenary persistence is unavailable: ${this.lastError.message}`
    );
  }
}

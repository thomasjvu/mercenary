const walletQueues: Map<string, Promise<void>> = new Map();

/** Serialize transactions that spend gas or tokens from the same wallet in one process. */
export async function withWalletTransactionLock<T>(
  walletAddress: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = walletAddress.toLowerCase();
  const previous = walletQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  walletQueues.set(key, current);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (walletQueues.get(key) === current) {
      walletQueues.delete(key);
    }
  }
}

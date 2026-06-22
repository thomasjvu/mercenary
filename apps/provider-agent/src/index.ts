import { providerConfig } from './config.js';
import { buildProviderAgentServer } from './server.js';

import { NETWORK } from '@bossraid/constants';
import logger from '@bossraid/logger';

export { buildProviderAgentServer } from './server.js';

async function main() {
  const app = buildProviderAgentServer();
  const host = process.env.BOSSRAID_PROVIDER_HOST ?? process.env.HOST ?? NETWORK.LOCALHOST;
  await app.listen({ host, port: providerConfig.port });
  logger.info(
    `Provider agent ${providerConfig.providerId} listening on http://${host}:${providerConfig.port}`
  );
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    if (isAddressInUseError(error)) {
      console.error(
        `[provider-agent] port ${providerConfig.port} already in use (${providerConfig.providerId})`
      );
      process.exit(1);
      return;
    }
    logger.error(error);
    process.exit(1);
  });
}

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

function registerShutdownHandlers(closeServer: () => Promise<void>): void {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    logger.info(`Shutting down provider agent ${providerConfig.providerId} after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      logger.error(error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

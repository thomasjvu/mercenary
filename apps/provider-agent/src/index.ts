import { providerConfig } from "./config.js";
import { buildProviderAgentServer } from "./server.js";

export { buildProviderAgentServer } from "./server.js";

async function main() {
  const app = buildProviderAgentServer();
  const host = process.env.BOSSRAID_PROVIDER_HOST ?? process.env.HOST ?? "127.0.0.1";
  await app.listen({ host, port: providerConfig.port });
  console.log(
    `Provider agent ${providerConfig.providerId} listening on http://${host}:${providerConfig.port}`,
  );
  registerShutdownHandlers(async () => {
    await app.close();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function registerShutdownHandlers(closeServer: () => Promise<void>): void {
  let closing = false;

  const shutdown = async (signal: string) => {
    if (closing) {
      return;
    }
    closing = true;
    console.log(`Shutting down provider agent ${providerConfig.providerId} after ${signal}`);
    try {
      await closeServer();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

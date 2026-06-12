import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import logger from '@bossraid/logger';
import { registerTools } from './tools.js';

const server = new Server(
  {
    name: 'boss-raid',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  logger.error(error);
  process.exit(1);
});

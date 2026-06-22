import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env.mjs';
import { collectProviderPorts, freePorts } from './lib/dev-ports.mjs';
import { resolveDevProvidersFile } from './lib/dev-providers-file.mjs';
import { loadProviderProfiles } from './lib/provider-launcher.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const providersFile = resolveDevProvidersFile(process.env);
const { providerProfiles } = loadProviderProfiles(rootDir, {
  ...process.env,
  BOSSRAID_PROVIDERS_FILE: providersFile,
});

const freed = freePorts(collectProviderPorts(providerProfiles), { label: 'dev:kill' });
if (freed === 0) {
  console.log('[dev:kill] no stale dev listeners found');
}

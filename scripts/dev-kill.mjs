import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env.mjs';
import { CORE_DEV_PORTS, collectProviderPorts, freePorts } from './lib/dev-ports.mjs';
import { resolveDevProvidersFile, shouldSpawnDevProviders } from './lib/dev-providers-file.mjs';
import { loadProviderProfiles } from './lib/provider-launcher.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);

const providersFile = resolveDevProvidersFile(process.env);
const { providerProfiles } = loadProviderProfiles(rootDir, {
  ...process.env,
  BOSSRAID_PROVIDERS_FILE: providersFile,
});

const spawnProviders = shouldSpawnDevProviders(process.env);
const freed = freePorts(spawnProviders ? collectProviderPorts(providerProfiles) : CORE_DEV_PORTS, {
  label: 'dev:kill',
});
if (freed === 0) {
  console.log('[dev:kill] no stale dev listeners found');
}

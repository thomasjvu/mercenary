import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env.mjs';
import { killProcessTree, spawnDevProcess } from './lib/dev-process.mjs';
import { resolveDevProvidersFile } from './lib/dev-providers-file.mjs';
import {
  attachProviderShutdown,
  buildProviderChildEnv,
  loadProviderProfiles,
} from './lib/provider-launcher.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const providerAgentDir = resolve(rootDir, 'apps/provider-agent');
loadLocalEnv(rootDir);
const inheritedEnv = process.env;
const providersFile = resolveDevProvidersFile(inheritedEnv);
const { providerProfiles } = loadProviderProfiles(rootDir, {
  ...inheritedEnv,
  BOSSRAID_PROVIDERS_FILE: providersFile,
});

const spawnProfiles = providerProfiles.filter((profile) => profile.spawnWorker !== false);
const children = spawnProfiles.map((profile, index) => {
  const child = spawnDevProcess(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: providerAgentDir,
    env: buildProviderChildEnv(profile, index, inheritedEnv, {
      includeStubMode: true,
      includeCallbackBase: true,
    }),
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[providers] ${profile.providerId} exited via signal ${signal}`);
      return;
    }
    if ((code ?? 0) !== 0) {
      console.log(`[providers] ${profile.providerId} exited with code ${code ?? 0}`);
    }
  });

  return child;
});

attachProviderShutdown(children, { killProcessTree });
console.log(
  `[providers] started ${children.length}/${providerProfiles.length} dev providers from ${providersFile}`
);

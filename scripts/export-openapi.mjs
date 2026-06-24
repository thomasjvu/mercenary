import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { stringify: stringifyYaml } = require('yaml');
const publicSpecPath = resolve(repoRoot, 'apps/docs/public/openapi-v1.yaml');
const internalSpecPath = resolve(repoRoot, 'apps/docs/public/openapi-internal.yaml');

process.env.BOSSRAID_STORAGE_BACKEND ??= 'memory';
process.env.BOSSRAID_SETTLEMENT_MODE ??= 'off';
process.env.BOSSRAID_X402_ENABLED ??= 'false';
process.env.BOSSRAID_ADMIN_TOKEN ??= 'openapi-export-token';
process.env.TSX_TSCONFIG_PATH ??= 'tsconfig.base.json';

const { BossRaidOrchestrator } = await import('@bossraid/orchestrator');
const { createProviderProfile, readyHealth } = await import('@bossraid/test-fixtures');
const { prepareApiServer } = await import('../apps/api/src/index.ts');
const { filterOpenApiDocument } = await import('../apps/api/src/openapi/filter.ts');

function createExportOrchestrator() {
  const provider = {
    profile: createProviderProfile('openapi-export-provider', {
      displayName: 'OpenAPI Export Provider',
      specializations: ['analysis'],
      supportedLanguages: ['typescript', 'text'],
    }),
    async accept() {
      return {
        accepted: true,
        providerRunId: 'openapi-export-run',
      };
    },
    async run() {},
    async health() {
      return readyHealth('openapi-export-provider');
    },
  };

  return new BossRaidOrchestrator([provider], {
    storageBackend: 'memory',
    settlementMode: 'off',
  });
}

async function exportSpecs() {
  const orchestrator = createExportOrchestrator();
  const app = await prepareApiServer(orchestrator, process.env);
  await app.ready();

  const fullDocument = app.swagger();
  const publicDocument = filterOpenApiDocument(fullDocument, 'public');
  const internalDocument = filterOpenApiDocument(fullDocument, 'internal');

  const publicYaml = stringifyYaml(publicDocument);
  const internalYaml = stringifyYaml(internalDocument);

  await writeFile(publicSpecPath, `${publicYaml.trim()}\n`, 'utf8');
  await writeFile(internalSpecPath, `${internalYaml.trim()}\n`, 'utf8');
  await app.close();

  console.log(`Wrote ${publicSpecPath}`);
  console.log(`Wrote ${internalSpecPath}`);
  console.log(
    `OpenAPI paths: public=${Object.keys(publicDocument.paths ?? {}).length}, internal=${Object.keys(internalDocument.paths ?? {}).length}`
  );
}

exportSpecs().catch((error) => {
  console.error(error);
  process.exit(1);
});
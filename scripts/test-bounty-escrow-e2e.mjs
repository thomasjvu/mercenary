import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canVerifyOnchain,
  loadBountyE2eEnv,
  parseCliArgs,
  readCliArg,
  resolveApiBase,
  resolveBountyE2eMode,
  resolveBountyProvider,
  resolvePosterPrivateKey,
  resolveProviderToken,
  resolveRewardUsd,
} from './lib/bounty-e2e-env.mjs';
import { runBountyEscrowE2e } from './lib/bounty-e2e-run.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseCliArgs(process.argv.slice(2));

if (args.has('help')) {
  console.log(
    [
      'Usage:',
      '  pnpm test:bounty-escrow:e2e',
      '  pnpm test:bounty-escrow:e2e -- --mode mock --api-base http://127.0.0.1:8787',
      '  pnpm test:bounty-escrow:e2e -- --mode unverified',
      '  pnpm test:bounty-escrow:e2e -- --mode wallet --provider-id bounty-e2e-provider',
      '',
      'Options:',
      '  --mode mock|wallet|unverified',
      '  --api-base <url>',
      '  --provider-id <providerId>',
      '',
      'Defaults:',
      '  api-base: http://127.0.0.1:8787',
      '  provider: bounty-e2e-provider (from examples/settlement/bounty-e2e.providers.json)',
      '  token: bossraid-provider-a',
    ].join('\n')
  );
  process.exit(0);
}

loadBountyE2eEnv(rootDir);

const mode = resolveBountyE2eMode(readCliArg(args, 'mode'));
const apiBase = resolveApiBase(readCliArg(args, 'api-base'));
const provider = resolveBountyProvider(rootDir, readCliArg(args, 'provider-id'));
const providerId = provider.providerId;
const providerToken = resolveProviderToken(provider);
const rewardUsd = resolveRewardUsd();
const posterPrivateKey = resolvePosterPrivateKey(mode);

await runBountyEscrowE2e({
  apiBase,
  mode,
  providerId,
  providerToken,
  rewardUsd,
  posterPrivateKey,
  onchainVerify: canVerifyOnchain(),
});
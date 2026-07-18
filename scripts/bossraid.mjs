#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Record<string, { description: string; category: string; run: (extra: string[]) => number | null }>} */
const COMMANDS = {
  // Dev
  'dev:evaluator': {
    category: 'dev',
    description: 'Start evaluator app only',
    run: (extra) => runPnpm(['--filter', '@bossraid/evaluator', 'dev', ...extra]),
  },
  'dev:mcp': {
    category: 'dev',
    description: 'Start MCP server dev stack',
    run: () => runNode('scripts/dev-mcp.mjs'),
  },
  'dev:orchestrator': {
    category: 'dev',
    description: 'Start orchestrator app only',
    run: (extra) => runPnpm(['--filter', '@bossraid/orchestrator', 'dev', ...extra]),
  },
  'dev:provider': {
    category: 'dev',
    description: 'Start a single provider agent',
    run: (extra) => runPnpm(['--filter', '@bossraid/provider-agent', 'dev', ...extra]),
  },

  // Sync & docs
  'sync:inference-catalog': {
    category: 'sync',
    description: 'Refresh inference catalog and reference pricing JSON',
    run: () => runNode('scripts/sync-inference-catalog.mjs'),
  },
  'sync:docs-routes': {
    category: 'sync',
    description: 'Regenerate API route table in content/docs/reference/routes.md',
    run: () => runNode('scripts/sync-docs-web-routes.mjs'),
  },
  'sync:openapi': {
    category: 'sync',
    description: 'Export public and operator OpenAPI specs into apps/docs/public',
    run: () =>
      runWithEnv({ TSX_TSCONFIG_PATH: 'tsconfig.base.json' }, 'node', [
        '--import',
        'tsx',
        'scripts/export-openapi.mjs',
      ]),
  },
  'check:openapi': {
    category: 'sync',
    description: 'Verify committed OpenAPI specs match @fastify/swagger output',
    run: () => runNode('scripts/check-openapi.mjs', ['--check']),
  },
  'sync:oc-references': {
    category: 'sync',
    description: 'Sync OC reference art from .private demo pipeline',
    run: () => runNode('.private/demo-video/scripts/sync-oc-references.mjs'),
  },
  'generate:skill': {
    category: 'sync',
    description: 'Sync content/skill.md to docs and web public/',
    run: () => runNode('scripts/sync-skill.mjs'),
  },
  'papers:sync-upstream': {
    category: 'sync',
    description: 'Pull papers framework changes into apps/docs',
    run: (extra) => runNode('scripts/papers-sync-upstream.mjs', extra),
  },
  'papers:sync-downstream': {
    category: 'sync',
    description: 'Push Boss Raid papers overrides upstream',
    run: (extra) => runNode('scripts/papers-sync-downstream.mjs', extra),
  },

  // Generate & export
  'generate:legal-character': {
    category: 'generate',
    description: 'Venice keyframe + clip; writes legal page webm',
    run: (extra) =>
      runNode('.private/demo-video/scripts/venice-legal-character.mjs', [
        '--regen-image',
        ...extra,
      ]),
  },
  'generate:pfp': {
    category: 'generate',
    description: 'Mercenary bust portrait to assets/boss-raid-pfp.png',
    run: () => runNode('.private/demo-video/scripts/venice-pfp.mjs'),
  },
  'generate:landing-hero': {
    category: 'generate',
    description: 'Seller / raider / buyer manga panels for web landing',
    run: () => runNode('.private/demo-video/scripts/venice-landing-hero.mjs'),
  },
  'generate:web-icon-subset': {
    category: 'generate',
    description: 'Build trimmed web icon font subset',
    run: () => runNode('scripts/generate-web-icon-subset.mjs'),
  },
  'generate:settlement-keys': {
    category: 'generate',
    description: 'Create settlement key material for onchain mode',
    run: () => runNode('scripts/generate-settlement-keys.mjs'),
  },
  'export:legal-character': {
    category: 'generate',
    description: 'Re-export legal page webm from existing S07 MP4',
    run: () => runNode('scripts/export-legal-character-video.mjs'),
  },
  'export:proof-bundle': {
    category: 'generate',
    description: 'Export attestation proof bundle for a raid',
    run: (extra) =>
      runWithEnv({ TSX_TSCONFIG_PATH: 'tsconfig.base.json' }, 'node', [
        '--import',
        'tsx',
        'scripts/export-proof-bundle.ts',
        ...extra,
      ]),
  },
  'verify:proof-bundle': {
    category: 'generate',
    description: 'Offline-verify an exported proof bundle',
    run: (extra) =>
      runWithEnv({ TSX_TSCONFIG_PATH: 'tsconfig.base.json' }, 'node', [
        '--import',
        'tsx',
        'scripts/verify-proof-bundle.ts',
        ...extra,
      ]),
  },

  // Tests (beyond CI defaults in package.json)
  'test:game-raid:e2e': {
    category: 'test',
    description: 'Game raid stack e2e (alias of test:smoke:e2e)',
    run: () => runNode('scripts/test-raid-e2e.mjs', ['--profile', 'game']),
  },
  'test:evaluator:e2e': {
    category: 'test',
    description: 'Evaluator sandbox e2e',
    run: () => runNode('scripts/test-evaluator-e2e.mjs'),
  },
  'test:private-game-raid:e2e': {
    category: 'test',
    description: 'Private game raid e2e',
    run: () => runNode('scripts/test-raid-e2e.mjs', ['--profile', 'private-game']),
  },
  'test:strict-private:e2e': {
    category: 'test',
    description: 'Strict-private raid e2e',
    run: () => runNode('scripts/test-raid-e2e.mjs', ['--profile', 'strict-private']),
  },
  'test:mcp:e2e': {
    category: 'test',
    description: 'MCP server e2e',
    run: () => runPnpm(['--filter', '@bossraid/mcp-server', 'test:e2e']),
  },
  'test:x402:e2e': {
    category: 'test',
    description: 'x402 payment flow e2e',
    run: () => runNode('scripts/test-x402-e2e.mjs'),
  },
  'test:x402:mock-facilitator': {
    category: 'test',
    description: 'Run local mock x402 facilitator',
    run: () => runNode('scripts/mock-x402-facilitator.mjs'),
  },
  'test:partyquest-bossraid:smoke': {
    category: 'test',
    description: 'Party Quest integration smoke',
    run: () => runNode('examples/campaigns/bossraid-development/scripts/test-party-quest-bossraid-smoke.mjs'),
  },
  'test:bounty-escrow:e2e': {
    category: 'test',
    description: 'Bounty escrow e2e against running API',
    run: (extra) => runNode('scripts/test-bounty-escrow-e2e.mjs', extra),
  },
  'test:bounty-escrow:production': {
    category: 'test',
    description: 'Bounty escrow production wallet smoke',
    run: () => runNode('scripts/test-bounty-escrow-production.mjs'),
  },

  // Runtime & verification
  'serve:gateway': {
    category: 'runtime',
    description: 'Serve built web + ops on one origin with API proxy',
    run: () => runNode('scripts/serve-gateway.mjs'),
  },
  'mercenary:rehearse': {
    category: 'runtime',
    description: 'Rehearse Mercenary raid flow against local stack',
    run: () => runNode('scripts/mercenary-rehearse.mjs'),
  },
  'verify:attestation': {
    category: 'runtime',
    description: 'Verify MNEMONIC-signed attestation envelopes',
    run: () => runNode('scripts/verify-attestation.mjs'),
  },
  'settle:raid': {
    category: 'runtime',
    description: 'Settle a raid via orchestrator CLI',
    run: (extra) => runPnpm(['--filter', '@bossraid/orchestrator', 'settle', ...extra]),
  },
  'game-raid:build-payload': {
    category: 'runtime',
    description: 'Build game raid payload from repo files',
    run: (extra) => runNode('scripts/build-game-raid-payload.mjs', extra),
  },
  'audit:production-env': {
    category: 'runtime',
    description: 'Static production deploy env audit (CI parity)',
    run: () => runNode('scripts/audit-production-deploy-env.mjs'),
  },

  // Settlement & contracts
  'bootstrap:settlement': {
    category: 'settlement',
    description: 'Bootstrap local settlement addresses and env',
    run: () => runNode('scripts/bootstrap-settlement.mjs'),
  },
  'bootstrap:settlement-env': {
    category: 'settlement',
    description: 'Write settlement env from deployed contracts',
    run: () => {
      const build = runPnpm(['build']);
      if (build !== 0) return build;
      return runPnpm(['--filter', '@bossraid/contracts', 'run', 'bootstrap:settlement-env']);
    },
  },
  'bootstrap:onchain': {
    category: 'settlement',
    description: 'Bootstrap onchain settlement wiring',
    run: () => {
      const build = runPnpm(['build']);
      if (build !== 0) return build;
      return runPnpm(['--filter', '@bossraid/contracts', 'run', 'bootstrap:onchain']);
    },
  },
  'deploy:contracts': {
    category: 'settlement',
    description: 'Build and deploy settlement contracts',
    run: () => {
      const build = runPnpm(['build']);
      if (build !== 0) return build;
      return runPnpm(['--filter', '@bossraid/contracts', 'run', 'deploy']);
    },
  },
  'deploy:contracts:testnet': {
    category: 'settlement',
    description:
      'Robinhood testnet (46630): deploy mintable TestUSDG + settlement contracts (not for production)',
    run: () => {
      const build = runPnpm(['build']);
      if (build !== 0) return build;
      return runPnpm(['--filter', '@bossraid/contracts', 'run', 'deploy:testnet']);
    },
  },

  // Deploy
  'deploy:web:cloudflare': {
    category: 'deploy',
    description: 'Deploy web app to Cloudflare Pages',
    run: () => runNode('scripts/deploy-web-cloudflare.mjs'),
  },
  'docker:build': {
    category: 'deploy',
    description: 'Build local Docker images',
    run: () => runNode('scripts/docker-build.mjs'),
  },
  'docker:up': {
    category: 'deploy',
    description: 'docker compose up --build',
    run: () => runNode('scripts/docker-compose.mjs', ['up', '--build']),
  },
  'docker:down': {
    category: 'deploy',
    description: 'docker compose down',
    run: () => runNode('scripts/docker-compose.mjs', ['down']),
  },
  'eigencompute:build': {
    category: 'deploy',
    description: 'Build EigenCompute runtime image (linux/amd64)',
    run: () =>
      runRaw('docker', [
        'build',
        '--platform',
        'linux/amd64',
        '-f',
        'Dockerfile.eigencompute',
        '-t',
        'bossraid-eigencompute:local',
        '.',
      ]),
  },
  'eigencompute:build-job': {
    category: 'deploy',
    description: 'Build EigenCompute evaluator job image',
    run: () =>
      runRaw('docker', [
        'build',
        '--platform',
        'linux/amd64',
        '-f',
        'Dockerfile.eigencompute',
        '--target',
        'evaluator-job',
        '-t',
        'bossraid-evaluator-job:eigencompute-local',
        '.',
      ]),
  },
  'bootstrap:phala:env': {
    category: 'deploy',
    description: 'Assemble deploy/phala/.env from secret fragments',
    run: () => runNode('scripts/bootstrap-phala-deploy-env.mjs'),
  },
  'production:cutover': {
    category: 'deploy',
    description: 'Production cutover: settlement IDs, contracts, Phala env',
    run: (extra) => runNode('scripts/production-cutover.mjs', extra),
  },
  'phala:secrets:check': {
    category: 'deploy',
    description: 'Preflight Phala deploy secrets file',
    run: (extra) => runNode('scripts/phala-secrets-preflight.mjs', extra),
  },

  // Infisical / Phala secrets
  'infisical:phala:check': {
    category: 'secrets',
    description: 'Check Infisical Phala secret sync state',
    run: () => runNode('scripts/infisical-phala-secrets.mjs', ['check']),
  },
  'infisical:phala:pull': {
    category: 'secrets',
    description: 'Pull Phala secrets from Infisical',
    run: () => runNode('scripts/infisical-phala-secrets.mjs', ['pull']),
  },
  'infisical:phala:push': {
    category: 'secrets',
    description: 'Push Phala secrets to Infisical',
    run: () => runNode('scripts/infisical-phala-secrets.mjs', ['push']),
  },
  'infisical:phala:prune-legacy': {
    category: 'secrets',
    description: 'Prune legacy Infisical Phala keys',
    run: () => runNode('scripts/infisical-phala-secrets.mjs', ['prune-legacy']),
  },

  // ACP seller
  'acp-seller:docker:build': {
    category: 'acp',
    description: 'Build ACP seller Docker image',
    run: () => runNode('scripts/build-acp-seller-image.mjs'),
  },
  'acp-seller:env:export': {
    category: 'acp',
    description: 'Export ACP seller env template',
    run: () => runNode('scripts/export-acp-seller-env.mjs'),
  },
};

const CATEGORY_ORDER = [
  'dev',
  'sync',
  'generate',
  'test',
  'runtime',
  'settlement',
  'deploy',
  'secrets',
  'acp',
];

const CORE_SCRIPTS = [
  'build',
  'build:docs',
  'check',
  'dev',
  'dev:api',
  'dev:docs',
  'dev:kill',
  'dev:ops',
  'dev:providers',
  'dev:web',
  'format',
  'format:check',
  'lint',
  'lint:strict',
  'test:unit',
  'test:money-path',
  'test:attestation',
  'test:smoke:e2e',
  'test:bounty-escrow:local',
];

function runRaw(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function runNode(script, args = []) {
  return runRaw('node', [script, ...args]);
}

function runPnpm(args) {
  return runRaw('pnpm', args);
}

function runWithEnv(extraEnv, command, args) {
  return runRaw(command, args, { ...process.env, ...extraEnv });
}

function printHelp(command) {
  if (command && COMMANDS[command]) {
    const entry = COMMANDS[command];
    console.log(`${command} — ${entry.description}`);
    console.log(`Category: ${entry.category}`);
    console.log('');
    console.log(`Usage: pnpm bossraid ${command} [-- extra args]`);
    return;
  }

  console.log('Boss Raid operator CLI');
  console.log('');
  console.log('Usage:');
  console.log('  pnpm bossraid <command> [-- extra args]');
  console.log('  pnpm bossraid list');
  console.log('  pnpm bossraid help [command]');
  console.log('');
  console.log('Contributor scripts (package.json):');
  for (const script of CORE_SCRIPTS) {
    console.log(`  pnpm ${script}`);
  }
  console.log('');
  console.log('Operator commands:');

  for (const category of CATEGORY_ORDER) {
    const entries = Object.entries(COMMANDS).filter(([, value]) => value.category === category);
    if (entries.length === 0) continue;
    console.log('');
    console.log(`  ${category}`);
    for (const [name, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`    ${name.padEnd(32)} ${value.description}`);
    }
  }
}

function printList() {
  for (const name of Object.keys(COMMANDS).sort()) {
    console.log(name);
  }
}

function splitArgs(argv) {
  const separator = argv.indexOf('--');
  if (separator === -1) {
    return { commandArgs: argv, passthrough: [] };
  }
  return {
    commandArgs: argv.slice(0, separator),
    passthrough: argv.slice(separator + 1),
  };
}

const rawArgv = process.argv.slice(2);
const { commandArgs, passthrough } = splitArgs(rawArgv);
const [command, subcommand] = commandArgs;

if (!command || command === 'help' || command === '--help' || command === '-h') {
  printHelp(subcommand);
  process.exit(0);
}

if (command === 'list') {
  printList();
  process.exit(0);
}

const entry = COMMANDS[command];
if (!entry) {
  console.error(`Unknown command: ${command}`);
  console.error('Run pnpm bossraid help for available commands.');
  process.exit(1);
}

const status = entry.run(passthrough);
process.exit(status ?? 0);

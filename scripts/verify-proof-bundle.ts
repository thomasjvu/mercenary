#!/usr/bin/env node
/**
 * Offline verification of a Boss Raid proof bundle (export:proof-bundle output).
 *
 * Does NOT trust the web UI. Recomputes harness composition hashes and structurally
 * validates raid/settlement/attestation artifacts. Optional onchain tx checks when
 * BOSSRAID_SETTLEMENT_RPC_URL (or eth_rpc) is set.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  harnessFreshClaimIsConsistent,
  recomputeHarnessCompositionHash,
} from '@bossraid/privacy-engine';
import type { HarnessProfile } from '@bossraid/shared-types';

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

type CheckResult = {
  id: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
};

type CliArgs = {
  dir?: string;
  strictTee?: boolean;
  json?: boolean;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    printHelp();
    process.exit(2);
  }
  const dir = resolve(args.dir);
  const report = await verifyBundle(dir, { strictTee: args.strictTee === true });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exitCode = report.ok ? 0 : 1;
}

async function verifyBundle(
  dir: string,
  options: { strictTee: boolean }
): Promise<{
  ok: boolean;
  dir: string;
  generatedAt: string;
  checks: CheckResult[];
  summary: { pass: number; fail: number; warn: number; skip: number };
}> {
  const checks: CheckResult[] = [];
  const add = (check: CheckResult) => checks.push(check);

  const required = ['proof-index.json', 'result.json'];
  for (const file of required) {
    const ok = await fileExists(resolve(dir, file));
    add({
      id: `bundle_schema_${file}`,
      status: ok ? 'pass' : 'fail',
      message: ok ? `Found ${file}` : `Missing required file ${file}`,
    });
  }

  const index = await readJsonSafe(resolve(dir, 'proof-index.json'));
  const result = await readJsonSafe(resolve(dir, 'result.json'));
  const providersDoc = await readJsonSafe(resolve(dir, 'providers.json'));
  const routing = await readJsonSafe(resolve(dir, 'routing-proof.json'));
  const attestationsDoc = await readJsonSafe(resolve(dir, 'attestations.json'));
  const settlementDoc = await readJsonSafe(resolve(dir, 'settlement.json'));
  const hostAttestation = await readJsonSafe(resolve(dir, 'host-attestation.json'));

  if (!index || !result) {
    return finalize(dir, checks);
  }

  const raidStatus =
    (index as { raid?: { status?: string } }).raid?.status ??
    (result as { status?: string }).status;
  const terminal = ['final', 'cancelled', 'expired'].includes(String(raidStatus));
  add({
    id: 'raid_terminal',
    status: terminal ? 'pass' : 'fail',
    message: terminal
      ? `Raid status is terminal (${raidStatus})`
      : `Raid status is not terminal (${raidStatus ?? 'unknown'})`,
  });

  const providers = Array.isArray((providersDoc as { providers?: unknown[] })?.providers)
    ? ((providersDoc as { providers: Array<Record<string, unknown>> }).providers ?? [])
    : [];
  const routingProviders = Array.isArray((routing as { providers?: unknown[] } | null)?.providers)
    ? ((routing as { providers: Array<{ providerId?: string; phase?: string }> }).providers ?? [])
    : Array.isArray(
          (result as { routingProof?: { providers?: unknown[] } })?.routingProof?.providers
        )
      ? ((
          result as {
            routingProof: { providers: Array<{ providerId?: string; phase?: string }> };
          }
        ).routingProof.providers ?? [])
      : [];

  if (providers.length === 0) {
    add({
      id: 'routing_providers',
      status: 'warn',
      message: 'providers.json missing or empty; skip routing cross-check',
    });
  } else if (routingProviders.length === 0) {
    add({
      id: 'routing_providers',
      status: 'warn',
      message: 'No routing proof providers to cross-check',
    });
  } else {
    const providerIds = new Set(providers.map((p) => String(p.providerId)));
    const missing = routingProviders
      .filter((p) => p.phase === 'primary' || !p.phase)
      .map((p) => p.providerId)
      .filter((id): id is string => Boolean(id) && !providerIds.has(id));
    add({
      id: 'routing_providers',
      status: missing.length === 0 ? 'pass' : 'fail',
      message:
        missing.length === 0
          ? 'Routing primaries present in providers.json'
          : `Missing provider rows: ${missing.join(', ')}`,
      details: { missing },
    });
  }

  let compositionFails = 0;
  let freshFails = 0;
  for (const provider of providers) {
    const profile = provider.harnessProfile as HarnessProfile | undefined | null;
    if (!profile || profile.lane !== 'agent_harness') {
      continue;
    }
    if (!harnessFreshClaimIsConsistent(profile)) {
      freshFails += 1;
    }
    if (profile.compositionHash) {
      const recomputed = recomputeHarnessCompositionHash({
        kind: String(profile.framework ?? profile.planProvider ?? 'unknown'),
        installation: profile.installation,
        skills: profile.skills ?? [],
        imageDigest: profile.imageDigest,
        framework: profile.framework,
        planProvider: profile.planProvider,
        modelId: typeof provider.modelId === 'string' ? provider.modelId : undefined,
        // modelApiBase is not stored on profile; host only hashed when provided at build time
      });
      // composition hash includes modelHost when modelApiBase was known at worker build time.
      // Without modelApiBase we can only check fresh claim + skill list consistency unless
      // the stored hash was built with null modelHost.
      const recomputedNullHost = recomputeHarnessCompositionHash({
        kind: String(profile.framework ?? profile.planProvider ?? 'unknown'),
        installation: profile.installation,
        skills: profile.skills ?? [],
        imageDigest: profile.imageDigest,
        framework: profile.framework,
        planProvider: profile.planProvider,
        modelId: typeof provider.modelId === 'string' ? provider.modelId : undefined,
      });
      if (
        recomputed !== profile.compositionHash &&
        recomputedNullHost !== profile.compositionHash
      ) {
        // Try kind = framework only (worker uses harness kind, which equals framework for glm/grok/codex)
        compositionFails += 1;
      }
    }
  }
  add({
    id: 'harness_fresh_claim',
    status: freshFails === 0 ? 'pass' : 'fail',
    message:
      freshFails === 0
        ? 'Fresh harness claims have empty skill lists'
        : `${freshFails} provider(s) claim fresh with non-empty skills`,
  });
  add({
    id: 'harness_composition',
    status: compositionFails === 0 ? 'pass' : 'warn',
    message:
      compositionFails === 0
        ? 'Harness composition hashes consistent (or no agent_harness profiles)'
        : `${compositionFails} composition hash(es) did not recompute — may need modelApiBase in bundle`,
  });

  const attestations = Array.isArray(
    (attestationsDoc as { attestations?: unknown[] } | null)?.attestations
  )
    ? ((attestationsDoc as { attestations: Array<Record<string, unknown>> }).attestations ?? [])
    : [];
  let teeShapeFails = 0;
  for (const row of attestations) {
    const attestation = row.privacyAttestation as
      | {
          featuresClaimed?: string[];
          featuresVerified?: string[];
        }
      | null
      | undefined;
    if (!attestation) {
      continue;
    }
    const claimed = attestation.featuresClaimed ?? [];
    const verified = attestation.featuresVerified ?? [];
    if (claimed.includes('tee_attested') && !verified.includes('tee_attested')) {
      if (options.strictTee) {
        teeShapeFails += 1;
      }
    }
  }
  add({
    id: 'privacy_attestation_shape',
    status:
      attestations.length === 0
        ? 'skip'
        : teeShapeFails === 0
          ? 'pass'
          : options.strictTee
            ? 'fail'
            : 'warn',
    message:
      attestations.length === 0
        ? 'No attestations.json rows'
        : teeShapeFails === 0
          ? 'Privacy attestation shapes OK'
          : `${teeShapeFails} submission(s) claim tee_attested without verified feature`,
  });

  const settlement = (settlementDoc as { settlement?: Record<string, unknown> } | null)?.settlement;
  const txs = Array.isArray(settlement?.transactionHashes)
    ? (settlement?.transactionHashes as string[])
    : [];
  if (!settlement) {
    add({
      id: 'settlement_txs',
      status: 'skip',
      message: 'No settlement.json payload',
    });
  } else if (txs.length === 0) {
    add({
      id: 'settlement_txs',
      status: settlement.mode === 'onchain' ? 'warn' : 'pass',
      message:
        settlement.mode === 'onchain'
          ? 'Onchain settlement has no transaction hashes'
          : `Settlement mode ${String(settlement.mode)} (no txs required)`,
    });
  } else {
    const rpc =
      process.env.BOSSRAID_SETTLEMENT_RPC_URL?.trim() ||
      process.env.ETH_RPC_URL?.trim() ||
      process.env.RPC_URL?.trim();
    if (!rpc) {
      add({
        id: 'settlement_txs',
        status: 'warn',
        message: `${txs.length} tx hash(es) present; set BOSSRAID_SETTLEMENT_RPC_URL to verify onchain`,
        details: { transactionHashes: txs },
      });
    } else {
      const missing: string[] = [];
      for (const hash of txs) {
        const found = await ethGetTransactionReceipt(rpc, hash);
        if (!found) {
          missing.push(hash);
        }
      }
      add({
        id: 'settlement_txs',
        status: missing.length === 0 ? 'pass' : 'fail',
        message:
          missing.length === 0
            ? `All ${txs.length} settlement tx(s) found on RPC`
            : `${missing.length} settlement tx(s) not found on RPC`,
        details: { missing },
      });
    }
  }

  if (!hostAttestation) {
    add({
      id: 'host_attestation',
      status: 'skip',
      message: 'host-attestation.json not in bundle (export with --api-base-url to include)',
    });
  } else {
    const teeVerified =
      (hostAttestation as { teeVerified?: boolean }).teeVerified === true ||
      (hostAttestation as { verified?: boolean }).verified === true;
    const hasQuote = Boolean(
      (hostAttestation as { quote?: unknown }).quote ||
      (hostAttestation as { teeAttestation?: unknown }).teeAttestation
    );
    add({
      id: 'host_attestation',
      status: hasQuote ? (teeVerified ? 'pass' : 'warn') : 'warn',
      message: hasQuote
        ? teeVerified
          ? 'Host attestation present and teeVerified'
          : 'Host attestation present but teeVerified is not true'
        : 'Host attestation JSON lacks quote payload',
    });
  }

  return finalize(dir, checks);
}

function finalize(dir: string, checks: CheckResult[]) {
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    skip: checks.filter((c) => c.status === 'skip').length,
  };
  return {
    ok: summary.fail === 0,
    dir,
    generatedAt: new Date().toISOString(),
    checks,
    summary,
  };
}

async function ethGetTransactionReceipt(rpcUrl: string, hash: string): Promise<boolean> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [hash],
      }),
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { result?: unknown };
    return payload.result != null;
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--' || !value) continue;
    if (value === '--help' || value === '-h') {
      printHelp();
      process.exit(0);
    }
    if (value === '--dir') {
      parsed.dir = argv[i + 1];
      i += 1;
      continue;
    }
    if (value === '--strict-tee') {
      parsed.strictTee = true;
      continue;
    }
    if (value === '--json') {
      parsed.json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(
    [
      'Verify a Boss Raid proof bundle offline.',
      '',
      'Usage:',
      '  pnpm bossraid verify:proof-bundle -- --dir temp/proof-bundles/<raidId>',
      '',
      'Options:',
      '  --dir <path>     Bundle directory from export:proof-bundle',
      '  --strict-tee     Fail when tee_attested is claimed but not verified',
      '  --json           Emit machine-readable report',
      '',
      'Optional env:',
      '  BOSSRAID_SETTLEMENT_RPC_URL  JSON-RPC for eth_getTransactionReceipt',
    ].join('\n')
  );
}

function printHuman(report: {
  ok: boolean;
  dir: string;
  checks: CheckResult[];
  summary: { pass: number; fail: number; warn: number; skip: number };
}): void {
  console.log(`PROOF_BUNDLE_DIR=${report.dir}`);
  console.log(
    `SUMMARY pass=${report.summary.pass} fail=${report.summary.fail} warn=${report.summary.warn} skip=${report.summary.skip}`
  );
  console.log(`OK=${report.ok}`);
  for (const check of report.checks) {
    console.log(`[${check.status.toUpperCase()}] ${check.id}: ${check.message}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

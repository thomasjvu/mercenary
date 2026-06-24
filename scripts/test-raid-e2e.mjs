import { runRaidE2e } from './lib/e2e-harness.mjs';

const PROFILES = {
  game: {
    defaultPortBase: 8700,
    sqlitePrefix: 'game-raid-e2e',
    providersFile: './examples/raids/game-raid/providers.http.json',
    raidFixture: './examples/raids/game-raid/native-raid.json',
    verifyResult: verifyGameRaidResult,
  },
  'private-game': {
    defaultPortBase: 8800,
    sqlitePrefix: 'private-game-raid-e2e',
    providersFile: './examples/raids/game-raid/providers.http.json',
    raidFixture: './examples/raids/game-raid/private-native-raid.json',
    verifyResult: verifyPrivateGameRaidResult,
  },
  'strict-private': {
    defaultPortBase: 8700,
    sqlitePrefix: 'strict-private-e2e',
    providersFile: './examples/raids/strict-private/providers.http.json',
    raidFixture: './examples/raids/strict-private/strict-private-raid.json',
    verifyResult: verifyStrictPrivateResult,
    afterVerify: verifyStrictPrivateAgentLog,
  },
};

const profile = parseProfile(process.argv.slice(2));
const config = PROFILES[profile];
if (!config) {
  console.error(`Unknown profile: ${profile}`);
  console.error(
    `Usage: node scripts/test-raid-e2e.mjs --profile ${Object.keys(PROFILES).join('|')}`
  );
  process.exit(1);
}

await runRaidE2e(config);

function parseProfile(argv) {
  const flagIndex = argv.indexOf('--profile');
  if (flagIndex === -1 || !argv[flagIndex + 1]) {
    return 'game';
  }
  return argv[flagIndex + 1];
}

function verifyGameRaidResult(result) {
  if (result.status !== 'final') {
    throw new Error(`Expected final raid result, received ${result.status}`);
  }
  if (!result.synthesizedOutput?.patchUnifiedDiff) {
    throw new Error('Expected synthesized patch output.');
  }
  const workstreams = result.synthesizedOutput?.workstreams ?? [];
  if (workstreams.length < 3) {
    throw new Error(`Expected at least 3 synthesized workstreams, received ${workstreams.length}`);
  }
  const artifactTypes = new Set(
    (result.synthesizedOutput?.artifacts ?? []).map((artifact) => artifact.outputType)
  );
  if (!artifactTypes.has('image') || !artifactTypes.has('video') || !artifactTypes.has('bundle')) {
    throw new Error(
      `Expected image, video, and bundle artifacts. Received ${JSON.stringify([...artifactTypes])}`
    );
  }
  if (!result.routingProof?.providers?.length) {
    throw new Error('Expected routing proof decisions.');
  }
}

function verifyPrivateGameRaidResult(result) {
  verifyGameRaidResult(result);
  const routingProof = result.routingProof;
  if (!routingProof) {
    throw new Error('Expected routing proof decisions.');
  }
  if (routingProof.policy?.privacyMode !== 'strict') {
    throw new Error(
      `Expected strict privacy mode, received ${routingProof.policy?.privacyMode ?? 'missing'}`
    );
  }
  if (routingProof.policy?.venicePrivateLane !== true) {
    throw new Error('Expected Venice private lane to be active.');
  }
  const primaryProviders = (routingProof.providers ?? []).filter(
    (provider) => provider.phase === 'primary'
  );
  if (primaryProviders.length < 3) {
    throw new Error(`Expected 3 primary routed providers, received ${primaryProviders.length}`);
  }
  for (const provider of primaryProviders) {
    if (!provider.veniceBacked) {
      throw new Error(`Expected Venice-backed primary provider, received ${provider.providerId}`);
    }
    if (!provider.erc8004Registered) {
      throw new Error(
        `Expected ERC-8004-registered primary provider, received ${provider.providerId}`
      );
    }
    if ((provider.trustScore ?? 0) < 80) {
      throw new Error(
        `Expected trust score >= 80 for ${provider.providerId}, received ${provider.trustScore}`
      );
    }
  }
}

function verifyStrictPrivateResult(result) {
  if (result.status !== 'final') {
    throw new Error(`Expected final raid result, received ${result.status}`);
  }
  if (result.synthesizedOutput?.primaryType !== 'text') {
    throw new Error(
      `Expected text primary output, received ${result.synthesizedOutput?.primaryType ?? 'missing'}`
    );
  }
  if (!result.synthesizedOutput?.answerText?.trim()) {
    throw new Error('Expected synthesized answer text.');
  }
  if (!result.routingProof) {
    throw new Error('Expected routing proof.');
  }

  verifyRoutingProof(result.routingProof);

  if (result.settlementExecution?.privacyCompliance) {
    const pc = result.settlementExecution.privacyCompliance;
    console.log(
      JSON.stringify(
        {
          step: 'privacy_compliance',
          overallPassed: pc.overallPassed,
          overallScore: pc.overallScore,
        },
        null,
        2
      )
    );
    if (!pc.overallPassed) {
      throw new Error(
        `Expected privacy compliance to pass for strict-private raid: ${JSON.stringify(pc.perProviderCompliance)}`
      );
    }
  } else {
    console.log(
      JSON.stringify(
        { step: 'privacy_compliance', note: 'no settlement execution yet (may be pending)' },
        null,
        2
      )
    );
  }
}

function verifyAgentLog(agentLog) {
  if (agentLog.task?.constraints?.privacyMode !== 'strict') {
    throw new Error(
      `Expected strict privacy in agent log, received ${agentLog.task?.constraints?.privacyMode ?? 'missing'}`
    );
  }
  if (agentLog.task?.constraints?.requireErc8004 !== true) {
    throw new Error('Expected ERC-8004 requirement in agent log.');
  }
  verifyRoutingProof(agentLog.routing);
}

function verifyRoutingProof(routingProof) {
  const policy = routingProof.policy ?? {};
  if (policy.privacyMode !== 'strict') {
    throw new Error(`Expected strict routing policy, received ${policy.privacyMode ?? 'missing'}`);
  }
  if (policy.selectionMode !== 'privacy_first') {
    throw new Error(
      `Expected privacy_first selection mode, received ${policy.selectionMode ?? 'missing'}`
    );
  }
  if (policy.requireErc8004 !== true) {
    throw new Error('Expected routing proof to require ERC-8004.');
  }
  if (policy.minTrustScore !== 80) {
    throw new Error(`Expected min trust score 80, received ${policy.minTrustScore ?? 'missing'}`);
  }
  if (!policy.allowedModelFamilies?.includes('venice')) {
    throw new Error(
      `Expected Venice-only routing, received ${JSON.stringify(policy.allowedModelFamilies ?? [])}`
    );
  }
  if (policy.venicePrivateLane !== true) {
    throw new Error('Expected Venice private lane to be active.');
  }

  const primaryProviders = (routingProof.providers ?? []).filter(
    (provider) => provider.phase === 'primary'
  );
  const uniquePrimaryProviders = [
    ...new Map(primaryProviders.map((provider) => [provider.providerId, provider])).values(),
  ];
  if (uniquePrimaryProviders.length < 2) {
    throw new Error(
      `Expected at least 2 unique primary providers, received ${uniquePrimaryProviders.length}`
    );
  }

  for (const provider of uniquePrimaryProviders) {
    if (!provider.veniceBacked) {
      throw new Error(`Expected Venice-backed provider, received ${provider.providerId}`);
    }
    if (!provider.erc8004Registered) {
      throw new Error(`Expected ERC-8004 registration for ${provider.providerId}`);
    }
    if (provider.trustScore < 80) {
      throw new Error(
        `Expected trust score >= 80 for ${provider.providerId}, received ${provider.trustScore}`
      );
    }
  }
}

async function fetchAgentLog(apiBaseUrl, raidId, raidAccessToken) {
  const response = await fetch(
    new URL(
      `/v1/raids/${encodeURIComponent(raidId)}/agent_log.json?token=${encodeURIComponent(raidAccessToken)}`,
      apiBaseUrl
    )
  );
  if (!response.ok) {
    throw new Error(`Agent log fetch failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function verifyStrictPrivateAgentLog({ apiBase, spawnBody, result }) {
  const agentLog = await fetchAgentLog(apiBase, spawnBody.raidId, spawnBody.raidAccessToken);
  verifyAgentLog(agentLog);
  console.log(
    JSON.stringify(
      {
        step: 'verified',
        raidId: spawnBody.raidId,
        answerPreview: result.synthesizedOutput?.answerText?.slice(0, 160) ?? null,
        routingPolicy: result.routingProof?.policy,
        routedProviders: result.routingProof?.providers.map((provider) => ({
          providerId: provider.providerId,
          phase: provider.phase,
          veniceBacked: provider.veniceBacked,
          erc8004Registered: provider.erc8004Registered,
          trustScore: provider.trustScore,
          reasons: provider.reasons,
        })),
      },
      null,
      2
    )
  );
}

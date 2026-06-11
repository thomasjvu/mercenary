import { runRaidE2e } from './lib/e2e-harness.mjs';

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

await runRaidE2e({
  defaultPortBase: 8700,
  sqlitePrefix: 'strict-private-e2e',
  providersFile: './examples/strict-private/providers.http.json',
  raidFixture: './examples/strict-private-raid.json',
  verifyResult: verifyStrictPrivateResult,
  afterVerify: async ({ apiBase, spawnBody, result }) => {
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
  },
});
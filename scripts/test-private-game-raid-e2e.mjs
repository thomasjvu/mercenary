import { runRaidE2e } from './lib/e2e-harness.mjs';

function verifyPrivateGameRaidResult(result) {
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

await runRaidE2e({
  defaultPortBase: 8800,
  sqlitePrefix: 'private-game-raid-e2e',
  providersFile: './examples/game-raid/providers.http.json',
  raidFixture: './examples/game-raid/private-native-raid.json',
  verifyResult: verifyPrivateGameRaidResult,
});
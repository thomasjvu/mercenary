import { runRaidE2e } from './lib/e2e-harness.mjs';

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

await runRaidE2e({
  defaultPortBase: 8700,
  sqlitePrefix: 'game-raid-e2e',
  providersFile: './examples/game-raid/providers.http.json',
  raidFixture: './examples/game-raid/native-raid.json',
  verifyResult: verifyGameRaidResult,
});
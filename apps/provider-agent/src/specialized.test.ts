import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ProviderTaskPackage } from '@bossraid/shared-types';

function createVideoTask(): ProviderTaskPackage {
  return {
    raidId: 'raid_video_test',
    submissionFormat: 'artifact_plus_explanation',
    desiredOutput: {
      primaryType: 'video',
      artifactTypes: ['video', 'text'],
    },
    task: {
      title:
        'Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.',
      description:
        'Create the trailer package and launch copy for the room-sized GB Studio reveal.',
      language: 'text',
    },
    artifacts: {
      files: [
        {
          path: 'marketing/creative-brief.md',
          content: '# Boss Raid: Slime Panic\n\nTone: Tense, retro-cute.\n',
          sha256: 'creative-brief-sha',
        },
      ],
      errors: [],
      reproSteps: ['Open the project', 'Package the trailer support'],
      tests: [],
      expectedBehavior: 'Return a video-first trailer package for the launch.',
    },
    constraints: {
      maxChangedFiles: 0,
      maxDiffLines: 0,
      forbidPaths: [],
      mustNot: [],
    },
    synthesis: {
      mode: 'multi_agent_synthesis',
      role: 'contributor',
      totalExperts: 3,
      providerIndex: 3,
      workstreamId: 'video-marketing',
      workstreamLabel: 'Video Marketing',
      workstreamObjective: 'Produce the trailer and launch package.',
      roleId: 'video-marketer',
      roleLabel: 'Video Marketing',
      roleObjective:
        'Produce the promo render artifact or final video handoff that best sells the requested game slice.',
      focus: '12-second trailer',
      guidance: ['Return one strong video deliverable.'],
    },
    deadlineUnix: Math.floor(Date.now() / 1000) + 60,
  };
}

let specializedModulePromise: Promise<typeof import('./specialized.js')> | undefined;

async function loadSpecializedModule() {
  process.env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH = '1';
  process.env.BOSSRAID_PROVIDER_MODE = 'remotion';
  specializedModulePromise ??= import('./specialized.js');
  return specializedModulePromise;
}

test('submissionSupportsRequestedOutput rejects artifact sets that miss the requested media type', async () => {
  const { submissionSupportsRequestedOutput } = await loadSpecializedModule();
  const task = createVideoTask();

  assert.equal(
    submissionSupportsRequestedOutput(
      {
        explanation: 'Only image previews were returned.',
        confidence: 0.6,
        filesTouched: [],
        artifacts: [
          {
            outputType: 'image',
            label: 'Storyboard frame',
            uri: 'data:image/png;base64,AAAA',
            mimeType: 'image/png',
          },
          {
            outputType: 'bundle',
            label: 'Trailer bundle',
            uri: 'data:application/json;base64,AAAA',
            mimeType: 'application/json',
          },
        ],
      },
      task
    ),
    false
  );
});

test('Riko remotion fallback still returns a video artifact when ffmpeg is unavailable', async () => {
  const { maybeRequestSpecializedSubmission, submissionSupportsRequestedOutput } =
    await loadSpecializedModule();
  const task = createVideoTask();
  const originalPath = process.env.PATH;

  process.env.PATH = '';
  try {
    const submission = await maybeRequestSpecializedSubmission(task);
    assert.ok(submission);
    const previewArtifact = submission.artifacts?.find(
      (artifact) => artifact.outputType === 'video'
    );
    assert.equal(previewArtifact?.outputType, 'video');
    assert.equal(previewArtifact?.mimeType, 'image/gif');
    assert.equal(previewArtifact?.uri.startsWith('data:image/gif;base64,'), true);
    assert.equal(submissionSupportsRequestedOutput(submission, task), true);
  } finally {
    process.env.PATH = originalPath;
  }
});

// Failure modes: a hung encoder never terminates, termination uses the wrong signal,
// or timeout fallback loses the requested video artifact. Total rendering time varies
// with host load, so observe the child process outcome instead of the render duration.
test('Riko remotion fallback kills a timed-out ffmpeg binary', async (t) => {
  const { maybeRequestSpecializedSubmission, submissionSupportsRequestedOutput } =
    await loadSpecializedModule();
  const task = createVideoTask();
  const originalPath = process.env.PATH;
  const fakeBinDir = await mkdtemp(join(tmpdir(), 'bossraid-riko-ffmpeg-'));
  const fakeFfmpegPath = join(fakeBinDir, 'ffmpeg');

  await writeFile(fakeFfmpegPath, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`);
  await chmod(fakeFfmpegPath, 0o755);

  process.env.PATH = originalPath ? `${fakeBinDir}:${originalPath}` : fakeBinDir;

  const spawnSync = childProcess.spawnSync;
  const encoderResults: ReturnType<typeof spawnSync>[] = [];
  const spawnMock = t.mock.method(
    childProcess,
    'spawnSync',
    (...args: Parameters<typeof spawnSync>) => {
      const result = spawnSync(...args);
      if (args[0] === 'ffmpeg') encoderResults.push(result);
      return result;
    }
  );
  syncBuiltinESMExports();

  try {
    const submission = await maybeRequestSpecializedSubmission(task);
    const previewArtifact = submission?.artifacts?.find(
      (artifact) => artifact.outputType === 'video'
    );

    assert.ok(submission);
    assert.equal(encoderResults.length, 1);
    assert.equal((encoderResults[0]?.error as NodeJS.ErrnoException)?.code, 'ETIMEDOUT');
    assert.equal(encoderResults[0]?.signal, 'SIGKILL');
    assert.equal(previewArtifact?.mimeType, 'image/gif');
    assert.equal(submissionSupportsRequestedOutput(submission, task), true);
  } finally {
    process.env.PATH = originalPath;
    spawnMock.mock.restore();
    syncBuiltinESMExports();
    await rm(fakeBinDir, { recursive: true, force: true });
  }
});

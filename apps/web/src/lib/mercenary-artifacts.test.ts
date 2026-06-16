import assert from 'node:assert/strict';
import test from 'node:test';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  buildArtifactDownloadName,
  decodeArtifactPayload,
  isRenderableImageArtifact,
  parseBundleArtifact,
} from './mercenary-artifacts.js';

test('decodeArtifactPayload reads plain and base64 data uris', () => {
  assert.equal(decodeArtifactPayload('data:text/plain,hello%20world'), 'hello world');
  assert.equal(decodeArtifactPayload('data:application/json;base64,eyJhIjoxfQ=='), '{"a":1}');
  assert.equal(decodeArtifactPayload('https://example.com/file'), null);
});

test('isRenderableImageArtifact accepts mime and output type hints', () => {
  assert.equal(
    isRenderableImageArtifact({ outputType: 'image', mimeType: 'image/png' } as SubmissionArtifact),
    true
  );
  assert.equal(
    isRenderableImageArtifact({ outputType: 'text', mimeType: 'text/plain' } as SubmissionArtifact),
    false
  );
});

test('parseBundleArtifact maps embedded bundle files', () => {
  const payload = JSON.stringify({
    artifactId: 'bundle-1',
    files: [
      {
        relativePath: 'out/frame.png',
        mimeType: 'image/png',
        bytes: 4,
        sha256: 'abc',
        data: 'aGVsbG8=',
      },
    ],
  });
  const artifact = {
    outputType: 'bundle',
    label: 'bundle',
    uri: `data:application/json;base64,${btoa(payload)}`,
  } as SubmissionArtifact;

  const parsed = parseBundleArtifact(artifact);
  assert.equal(parsed?.artifactId, 'bundle-1');
  assert.equal(parsed?.files[0]?.relativePath, 'out/frame.png');
  assert.match(parsed?.files[0]?.uri ?? '', /^data:image\/png;base64,/);
});

test('buildArtifactDownloadName slugifies labels with mime extensions', () => {
  assert.equal(
    buildArtifactDownloadName({
      label: 'Hero Frame #1',
      outputType: 'image',
      mimeType: 'image/png',
      uri: 'data:image/png;base64,',
    } as SubmissionArtifact),
    'hero-frame-1.png'
  );
});

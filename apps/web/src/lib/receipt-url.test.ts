import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAgentLogUrl,
  buildAgentManifestUrl,
  buildAttestationSurfaceLabel,
  buildAttestedResultUrl,
  buildAttestedRuntimeUrl,
  buildReceiptPath,
  buildReceiptUrl,
  isAttestationSignerUnavailable,
  readReceiptQuery,
} from './receipt-url.js';

test('buildReceiptPath encodes raid and token query params', () => {
  assert.equal(
    buildReceiptPath({ raidId: 'raid-1', token: 'tok&secret' }),
    '/verification?raidId=raid-1&token=tok%26secret'
  );
});

test('buildReceiptUrl resolves against window origin', () => {
  const originalLocation = globalThis.window?.location;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://bossraid.example', search: '' },
    },
  });

  try {
    assert.equal(
      buildReceiptUrl({ raidId: 'raid-1', token: 'tok' }),
      'https://bossraid.example/verification?raidId=raid-1&token=tok'
    );
  } finally {
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: originalLocation },
      });
    }
  }
});

test('readReceiptQuery accepts canonical and legacy param names', () => {
  const originalLocation = globalThis.window?.location;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        origin: 'https://bossraid.example',
        search: '?raid_id=legacy-raid&raid_access_token=legacy-token',
      },
    },
  });

  try {
    assert.deepEqual(readReceiptQuery(), {
      raidId: 'legacy-raid',
      token: 'legacy-token',
    });
  } finally {
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: originalLocation },
      });
    }
  }
});

test('readReceiptQuery returns null when params are missing', () => {
  const originalLocation = globalThis.window?.location;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { origin: 'https://bossraid.example', search: '?raidId=only-id' },
    },
  });

  try {
    assert.equal(readReceiptQuery(), null);
  } finally {
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: originalLocation },
      });
    }
  }
});

test('buildAttestedResultUrl and buildAgentLogUrl encode raid id and token', () => {
  const query = { raidId: 'raid/special', token: 'tok value' };

  assert.equal(
    buildAttestedResultUrl(query),
    '/api/v1/raid/raid%2Fspecial/attested-result?token=tok%20value'
  );
  assert.equal(
    buildAgentLogUrl(query),
    '/api/v1/raid/raid%2Fspecial/agent_log.json?token=tok%20value'
  );
});

test('buildAgentManifestUrl and buildAttestedRuntimeUrl use API base', () => {
  assert.equal(buildAgentManifestUrl(), '/api/v1/agent.json');
  assert.equal(buildAttestedRuntimeUrl(), '/api/v1/attested-runtime');
});

test('buildAttestationSurfaceLabel maps known vendors and falls back gracefully', () => {
  assert.equal(buildAttestationSurfaceLabel('phala-worker', null), 'Phala TEE-attested');
  assert.equal(buildAttestationSurfaceLabel(null, 'EigenCompute'), 'EigenCompute TEE-attested');
  assert.equal(buildAttestationSurfaceLabel(null, 'CustomTEE'), 'CustomTEE TEE-attested');
  assert.equal(buildAttestationSurfaceLabel(null, null), 'TEE-attested');
});

test('isAttestationSignerUnavailable detects mnemonic requirement errors', () => {
  assert.equal(isAttestationSignerUnavailable('MNEMONIC environment variable is required'), true);
  assert.equal(isAttestationSignerUnavailable('other error'), false);
  assert.equal(isAttestationSignerUnavailable(undefined), false);
});

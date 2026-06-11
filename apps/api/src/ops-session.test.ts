import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverMessageAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer } from './index.js';
import {
  createProviderProfile,
  hashText,
  join,
  mkdtemp,
  readyHealth,
  rm,
  stableStringify,
  TEST_MNEMONIC,
  tmpdir,
} from './test/helpers.js';

test('ops session can authenticate internal control routes without a browser-shipped bearer', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    const sessionLogin = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'admin-secret',
      },
    });

    assert.equal(sessionLogin.statusCode, 200);
    const setCookie = sessionLogin.headers['set-cookie'];
    assert.equal(typeof setCookie, 'string');
    assert.match(String(setCookie), /HttpOnly/);
    assert.match(String(setCookie), /SameSite=Strict/);
    assert.match(String(setCookie), /Path=\/ops-api/);

    const cookie = String(setCookie).split(';')[0];

    const sessionStatus = await app.inject({
      method: 'GET',
      url: '/v1/ops/session',
      headers: {
        cookie,
      },
    });

    assert.equal(sessionStatus.statusCode, 200);
    assert.equal(sessionStatus.json().authenticated, true);

    const raidsAuthorized = await app.inject({
      method: 'GET',
      url: '/v1/raids',
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAuthorized.statusCode, 200);

    const sessionLogout = await app.inject({
      method: 'DELETE',
      url: '/v1/ops/session',
      headers: {
        cookie,
      },
    });

    assert.equal(sessionLogout.statusCode, 200);
    assert.equal(sessionLogout.json().authenticated, false);

    const raidsAfterLogout = await app.inject({
      method: 'GET',
      url: '/v1/raids',
      headers: {
        cookie,
      },
    });

    assert.equal(raidsAfterLogout.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('ops session login is rate limited', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_OPS_SESSION_RATE_LIMIT_MAX: '1',
    BOSSRAID_OPS_SESSION_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'wrong-secret',
      },
    });
    assert.equal(firstAttempt.statusCode, 401);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'wrong-secret',
      },
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
    assert.equal(secondAttempt.headers['retry-after'], '60');
  } finally {
    await app.close();
  }
});

test('ops session survives API restarts when persistence is file-backed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-api-control-state-'));
  const env = {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    BOSSRAID_STORAGE_BACKEND: 'sqlite',
    BOSSRAID_SQLITE_FILE: join(dir, 'state.sqlite'),
  };

  const appA = buildApiServer(new BossRaidOrchestrator(), env);
  try {
    const login = await appA.inject({
      method: 'POST',
      url: '/v1/ops/session',
      payload: {
        token: 'admin-secret',
      },
    });

    assert.equal(login.statusCode, 200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];

    await appA.close();

    const appB = buildApiServer(new BossRaidOrchestrator(), env);
    try {
      const sessionStatus = await appB.inject({
        method: 'GET',
        url: '/v1/ops/session',
        headers: {
          cookie,
        },
      });

      assert.equal(sessionStatus.statusCode, 200);
      assert.equal(sessionStatus.json().authenticated, true);
    } finally {
      await appB.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('admin control routes return 503 until admin auth is configured', async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/raids',
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), {
      error: 'admin_auth_not_configured',
      message: 'BOSSRAID_ADMIN_TOKEN is required for this route.',
    });
  } finally {
    await app.close();
  }
});

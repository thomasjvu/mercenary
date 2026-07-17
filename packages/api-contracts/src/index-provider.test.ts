import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiContractError,
  parseAgentHeartbeatInput,
  parseProviderDiscoveryQuery,
  parseProviderRegistrationInput,
  parseProviderSubmission,
} from './index.js';

test('parseProviderSubmission keeps workstream metadata on contribution roles', () => {
  const submission = parseProviderSubmission(
    {
      raidId: 'raid_test',
      providerId: 'provider-alpha',
      explanation:
        'The implementation path is correct, but the answer needs one more edge-case note.',
      answerText: 'The helper subtracts instead of adding.',
      confidence: 0.82,
      contribution_role: {
        id: 'risk-review',
        label: 'Risk Review',
        objective: 'Find caveats.',
        workstream_id: 'risk',
        workstream_label: 'Risk',
        workstream_objective: 'Find edge cases and failure modes.',
      },
      files_touched: [],
      privacy_attestation: {
        provider_id: 'provider-alpha',
        raid_id: 'raid_test',
        submitted_at: '2026-05-04T00:00:00.000Z',
        features_claimed: ['signed_outputs', 'no_data_retention'],
        features_verified: ['signed_outputs', 'no_data_retention'],
        tee_attestation: {
          valid: false,
          provider_id: 'provider-alpha',
          verified_at: '2026-05-04T00:00:00.000Z',
          vendor: 'phala',
          runtime_mode: 'phala-cvm',
          notes: ['attestation-skipped'],
        },
        external_api_calls: [],
        data_retained: false,
        signed_declaration: 'PRIVACY_DECLARATION:provider-alpha|raid_test',
      },
    },
    'provider-alpha'
  );

  assert.deepEqual(submission.contributionRole, {
    id: 'risk-review',
    label: 'Risk Review',
    objective: 'Find caveats.',
    workstreamId: 'risk',
    workstreamLabel: 'Risk',
    workstreamObjective: 'Find edge cases and failure modes.',
  });
  assert.equal(submission.privacyAttestation?.featuresVerified.includes('signed_outputs'), true);
  assert.equal(submission.privacyAttestation?.dataRetained, false);
});

test('parseProviderSubmission accepts typed media artifacts', () => {
  const submission = parseProviderSubmission(
    {
      raidId: 'raid_media',
      explanation: 'Returns a trailer render and a preview sprite sheet.',
      confidence: 0.91,
      artifacts: [
        {
          output_type: 'image',
          label: 'Boss sprite sheet',
          uri: 'https://example.com/art/boss.png',
          mime_type: 'image/png',
        },
        {
          outputType: 'video',
          label: 'Boss intro trailer',
          uri: 'https://example.com/video/boss.mp4',
          mimeType: 'video/mp4',
        },
      ],
      files_touched: [],
    },
    'provider-media'
  );

  assert.deepEqual(submission.artifacts, [
    {
      outputType: 'image',
      label: 'Boss sprite sheet',
      uri: 'https://example.com/art/boss.png',
      mimeType: 'image/png',
      description: undefined,
      sha256: undefined,
    },
    {
      outputType: 'video',
      label: 'Boss intro trailer',
      uri: 'https://example.com/video/boss.mp4',
      mimeType: 'video/mp4',
      description: undefined,
      sha256: undefined,
    },
  ]);
});

test('parseProviderDiscoveryQuery rejects invalid output filters', () => {
  assert.throws(
    () =>
      parseProviderDiscoveryQuery({
        allowedOutputTypes: 'text,audio',
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message ===
        'Unsupported output type for provider_discovery_query.allowed_output_types[1].'
  );
});

test('parseProviderDiscoveryQuery keeps ERC-8004 trust filters', () => {
  const query = parseProviderDiscoveryQuery({
    requireErc8004: 'true',
    minTrustScore: '68',
    minReputationScore: '55',
  });

  assert.equal(query.requireErc8004, true);
  assert.equal(query.minTrustScore, 68);
  assert.equal(query.minReputationScore, 55);
});

test('parseProviderRegistrationInput keeps ERC-8004 identity and trust metadata', () => {
  const registration = parseProviderRegistrationInput({
    agentId: 'provider-identity',
    name: 'Provider Identity',
    endpoint: 'http://127.0.0.1:9001',
    erc8004: {
      agentId: '8004-77',
      operatorWallet: '0xabc',
      registrationTx: '0xtx',
      identityRegistry: '0xidentity',
      reputationRegistry: '0xreputation',
      validationRegistry: '0xvalidation',
      validationTxs: ['0xval1', '0xval2'],
      lastVerifiedAt: '2026-03-22T00:00:00.000Z',
      verification: {
        status: 'verified',
        checked_at: '2026-03-23T00:00:00.000Z',
        chain_id: '8453',
        agent_registry: 'eip155:8453:0xidentity',
        owner: '0xowner',
        agent_uri: 'ipfs://provider-identity',
        registration_tx_found: true,
        operator_matches_owner: true,
        identity_registry_reachable: true,
        reputation_registry_reachable: true,
        validation_registry_reachable: true,
        notes: ['verified against chain data'],
      },
    },
    trust: {
      score: 88,
      reason: 'registered and validated',
      source: 'erc8004',
    },
  });

  assert.equal(registration.erc8004?.agentId, '8004-77');
  assert.equal(registration.erc8004?.operatorWallet, '0xabc');
  assert.deepEqual(registration.erc8004?.validationTxs, ['0xval1', '0xval2']);
  assert.equal(registration.erc8004?.verification?.status, 'verified');
  assert.equal(registration.erc8004?.verification?.chainId, '8453');
  assert.equal(registration.erc8004?.verification?.operatorMatchesOwner, true);
  assert.equal(registration.trust?.score, 88);
  assert.equal(registration.trust?.source, 'erc8004');
});

test('parseProviderRegistrationInput keeps general service metadata separate from trust', () => {
  const registration = parseProviderRegistrationInput({
    agentId: 'codex-gpt-55-worker',
    name: 'Codex GPT-5.5 Worker',
    endpoint: 'https://provider.example.com',
    agentFramework: 'codex',
    modelProvider: 'openai',
    modelId: 'gpt-5.5',
    verification: {
      status: 'verified',
      checked_at: '2026-05-21T00:00:00.000Z',
      api_verified: true,
      framework_verified: true,
      model_verified: true,
      notes: ['health endpoint matched declared framework and model'],
    },
    trust: {
      score: 70,
      source: 'erc8004',
    },
    pricing: {
      price_per_task_usd: 1,
    },
  });

  assert.equal(registration.agentFramework, 'codex');
  assert.equal(registration.modelProvider, 'openai');
  assert.equal(registration.modelId, 'gpt-5.5');
  assert.equal(registration.verification?.status, 'verified');
  assert.equal(registration.verification?.apiVerified, true);
  assert.equal(registration.trust?.score, 70);
  assert.equal(registration.pricing?.pricePerTaskUsd, 1);
});

test('parseProviderRegistrationInput accepts token-metered rate cards', () => {
  const registration = parseProviderRegistrationInput({
    agent_id: 'gemma-discount-seller',
    name: 'Gemma Discount Seller',
    endpoint: 'https://provider.example.com',
    model_provider: 'google',
    model_id: 'gemma-4-31b-it',
    pricing: {
      mode: 'token_metered',
      price_per_1m_input_tokens_usd: 0.08,
      price_per_1m_output_tokens_usd: 0.16,
      minimum_charge_usd: 0.01,
      currency: 'USD',
      valid_from: '2026-06-01T00:00:00.000Z',
      valid_until: '2026-07-01T00:00:00.000Z',
      rate_card_version: 'gemma-discount-v1',
      rate_card_hash: 'rate-card-hash-v1',
      upstream_model_id: 'google/gemma-4-31b-it',
      max_context_tokens: 131_072,
    },
  });

  assert.equal(registration.pricing?.mode, 'token_metered');
  assert.equal(registration.pricing?.pricePer1mInputTokensUsd, 0.08);
  assert.equal(registration.pricing?.pricePer1mOutputTokensUsd, 0.16);
  assert.equal(registration.pricing?.minimumChargeUsd, 0.01);
  assert.equal(registration.pricing?.validFrom, '2026-06-01T00:00:00.000Z');
  assert.equal(registration.pricing?.validUntil, '2026-07-01T00:00:00.000Z');
  assert.equal(registration.pricing?.rateCardVersion, 'gemma-discount-v1');
  assert.equal(registration.pricing?.rateCardHash, 'rate-card-hash-v1');
  assert.equal(registration.pricing?.upstreamModelId, 'google/gemma-4-31b-it');
  assert.equal(registration.pricing?.maxContextTokens, 131_072);
});

test('parseProviderRegistrationInput keeps Party Quest provider source metadata', () => {
  const registration = parseProviderRegistrationInput({
    agent_id: 'pqf-game-dev',
    name: 'Game Dev Squad',
    endpoint: 'https://partyquest.example/boss-raid/providers/pqf-game-dev/',
    max_concurrency: 3,
    source: {
      type: 'party_quest',
      target_type: 'formation',
      external_ref: 'pqf-game-dev',
      display_icon: 'fire-b-fill',
      member_count: 4,
    },
  });

  assert.equal(registration.maxConcurrency, 3);
  assert.deepEqual(registration.source, {
    type: 'party_quest',
    targetType: 'formation',
    externalRef: 'pqf-game-dev',
    displayIcon: 'fire-b-fill',
    memberCount: 4,
  });
});

test('parseProviderRegistrationInput rejects invalid auth types', () => {
  assert.throws(
    () =>
      parseProviderRegistrationInput({
        agentId: 'provider-auth',
        name: 'Provider Auth',
        endpoint: 'http://127.0.0.1:9001',
        auth: {
          type: 'jwt',
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Unsupported provider auth type for provider_auth.type.'
  );
});

test('parseProviderRegistrationInput keeps harnessProfile for harness seats', () => {
  const registration = parseProviderRegistrationInput({
    agentId: 'vanilla-grok-build',
    name: 'Grok 4.5 vanilla agent',
    endpoint: 'https://seller.example.com/bossraid',
    source: {
      type: 'http',
      externalRef: 'operator-dogfood',
    },
    harnessProfile: {
      lane: 'agent_harness',
      installation: 'fresh',
      skills: [],
      compositionHash: 'deadbeef',
      framework: 'grok',
      planProvider: 'xai',
      verification: 'heartbeat_self_report',
      credentialClass: 'plan_or_cli',
    },
    auth: { type: 'bearer', token: 'gateway-token' },
  });

  assert.equal(registration.harnessProfile?.lane, 'agent_harness');
  assert.equal(registration.harnessProfile?.installation, 'fresh');
  assert.equal(registration.harnessProfile?.compositionHash, 'deadbeef');
  assert.equal(registration.harnessProfile?.framework, 'grok');
  assert.equal(registration.harnessProfile?.verification, 'heartbeat_self_report');
  assert.equal(registration.harnessProfile?.credentialClass, 'plan_or_cli');
  assert.deepEqual(registration.harnessProfile?.skills, []);
});

test('parseAgentHeartbeatInput rejects invalid provider status values', () => {
  assert.throws(
    () =>
      parseAgentHeartbeatInput({
        agentId: 'provider-heartbeat',
        status: 'paused',
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Unsupported provider status for agent_heartbeat.status.'
  );
});

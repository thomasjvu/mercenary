import type {
  UpstreamAttestationVerifyInput,
  UpstreamAttestationVerifyResult,
  UpstreamTeeCheck,
  UpstreamTeeVendor,
} from './types.js';
import { buildQuoteExplorerUrl, verifyIntelQuote } from './quote-verify.js';

function verifyNonceBinding(
  expectedNonce: string,
  actualNonce: string | undefined,
  checkId: string
): UpstreamTeeCheck {
  const passed =
    typeof actualNonce === 'string' && actualNonce.toLowerCase() === expectedNonce.toLowerCase();
  return {
    id: checkId,
    passed,
    detail: passed ? 'Nonce matches request.' : 'Nonce mismatch — possible replay.',
  };
}

function verifyVeniceReport(
  input: UpstreamAttestationVerifyInput
): UpstreamAttestationVerifyResult {
  const report = input.report;
  const checks: UpstreamTeeCheck[] = [
    {
      id: 'server_verified',
      passed: report.verified === true,
      detail:
        report.verified === true
          ? 'Upstream server verified attestation.'
          : 'Upstream server did not verify attestation.',
    },
    verifyNonceBinding(
      input.nonce,
      typeof report.nonce === 'string' ? report.nonce : undefined,
      'nonce_binding'
    ),
    {
      id: 'intel_quote_present',
      passed: typeof report.intel_quote === 'string' && report.intel_quote.length > 0,
    },
    {
      id: 'signing_address_present',
      passed: typeof report.signing_address === 'string' && report.signing_address.length > 0,
    },
  ];

  const signingKey = report.signing_key ?? report.signing_public_key;
  const e2eeReady = typeof signingKey === 'string' && signingKey.length > 0;

  return finalizeResult(input, checks, e2eeReady, report.verified === true);
}

function verifyRedpillLikeReport(
  input: UpstreamAttestationVerifyInput,
  attestation: Record<string, unknown>
): UpstreamAttestationVerifyResult {
  const checks: UpstreamTeeCheck[] = [
    verifyNonceBinding(
      input.nonce,
      typeof attestation.request_nonce === 'string' ? attestation.request_nonce : undefined,
      'nonce_binding'
    ),
    {
      id: 'intel_quote_present',
      passed: typeof attestation.intel_quote === 'string' && attestation.intel_quote.length > 0,
    },
    {
      id: 'nvidia_payload_present',
      passed:
        typeof attestation.nvidia_payload === 'string' && attestation.nvidia_payload.length > 0,
    },
    {
      id: 'signing_address_present',
      passed:
        typeof attestation.signing_address === 'string' && attestation.signing_address.length > 0,
    },
  ];

  return finalizeResult(
    input,
    checks,
    true,
    checks.every((check) => check.passed)
  );
}

function verifyNearReport(input: UpstreamAttestationVerifyInput): UpstreamAttestationVerifyResult {
  const attestations = Array.isArray(input.report.model_attestations)
    ? (input.report.model_attestations as Record<string, unknown>[])
    : [];

  if (attestations.length === 0) {
    return finalizeResult(
      input,
      [{ id: 'model_attestations', passed: false, detail: 'No model attestations returned.' }],
      false,
      false
    );
  }

  const first = attestations[0] ?? {};
  return verifyRedpillLikeReport(input, first);
}

function verifyChutesReport(
  input: UpstreamAttestationVerifyInput
): UpstreamAttestationVerifyResult {
  const checks: UpstreamTeeCheck[] = [
    {
      id: 'tdx_quote_present',
      passed: typeof input.report.quote === 'string' && input.report.quote.length > 0,
    },
    {
      id: 'gpu_evidence_present',
      passed: Array.isArray(input.report.gpu_evidence) && input.report.gpu_evidence.length > 0,
    },
    {
      id: 'certificate_present',
      passed: typeof input.report.certificate === 'string' && input.report.certificate.length > 0,
    },
  ];

  return finalizeResult(
    input,
    checks,
    false,
    checks.every((check) => check.passed)
  );
}

function finalizeResult(
  input: UpstreamAttestationVerifyInput,
  checks: UpstreamTeeCheck[],
  e2eeReady: boolean,
  serverVerified: boolean
): UpstreamAttestationVerifyResult {
  const intelQuote =
    typeof input.report.intel_quote === 'string'
      ? input.report.intel_quote
      : typeof input.report.quote === 'string'
        ? input.report.quote
        : undefined;

  const signingAddress =
    typeof input.report.signing_address === 'string' ? input.report.signing_address : undefined;

  const mockMode = input.mockMode === true || process.env.BOSSRAID_UPSTREAM_TEE_MOCK === '1';
  const quoteCheck = verifyIntelQuote(intelQuote, { mockMode });
  checks.push({
    id: 'intel_quote_cryptographic',
    passed: quoteCheck.passed,
    detail: quoteCheck.detail,
  });

  const valid =
    checks.filter((check) => check.id !== 'server_verified').every((check) => check.passed) &&
    (input.vendor === 'venice' ? serverVerified : true);

  return {
    valid,
    vendor: input.vendor,
    modelId: input.modelId,
    nonce: input.nonce,
    verifiedAt: new Date().toISOString(),
    signingAddress,
    signingAlgo:
      typeof input.report.signing_algo === 'string'
        ? (input.report.signing_algo as 'ecdsa' | 'ed25519')
        : 'ecdsa',
    serverVerified,
    e2eeReady,
    checks,
    explorerUrl: buildQuoteExplorerUrl(intelQuote),
  };
}

export function verifyUpstreamAttestationReport(
  input: UpstreamAttestationVerifyInput
): UpstreamAttestationVerifyResult {
  switch (input.vendor) {
    case 'venice':
      return verifyVeniceReport(input);
    case 'redpill':
    case 'phala':
      return verifyRedpillLikeReport(input, input.report);
    case 'near':
      return verifyNearReport(input);
    case 'chutes':
      return verifyChutesReport(input);
  }
}

export function toTeeAttestationResult(
  providerId: string,
  result: UpstreamAttestationVerifyResult,
  extras?: { signingKey?: string; mockMode?: boolean }
): {
  valid: boolean;
  providerId: string;
  verifiedAt: string;
  vendor: string;
  enclaveHash?: string;
  signature?: string;
  runtimeMode?: string;
  notes?: string[];
  upstreamVendor?: UpstreamTeeVendor;
  checks?: UpstreamTeeCheck[];
  explorerUrl?: string;
  e2eeReady?: boolean;
  signingAddress?: string;
  signingKey?: string;
} {
  return {
    valid: result.valid,
    providerId,
    verifiedAt: result.verifiedAt,
    vendor: result.vendor,
    runtimeMode: extras?.mockMode ? 'mock' : `${result.vendor}-upstream-tee`,
    notes: result.checks.filter((check) => !check.passed).map((check) => check.detail ?? check.id),
    upstreamVendor: result.vendor,
    checks: result.checks,
    explorerUrl: result.explorerUrl,
    e2eeReady: result.e2eeReady,
    signingAddress: result.signingAddress,
    signingKey: extras?.signingKey,
  };
}

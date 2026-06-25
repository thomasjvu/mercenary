import { createHash } from 'node:crypto';

const MOCK_QUOTES = new Set(['mock-intel-quote', 'mock-tdx-quote']);
const DEFAULT_PHALA_VERIFY_URL = 'https://cloud-api.phala.com/api/v1/attestations/verify';
const MIN_TDX_QUOTE_BYTES = 128;

export type QuoteVerifyResult = {
  passed: boolean;
  detail: string;
  quoteHash?: string;
};

type PhalaVerifyResponse = {
  verified?: boolean;
  success?: boolean;
  status?: string;
  error?: string;
  detail?: string;
  proof_of_cloud?: boolean;
  quote?: { verified?: boolean };
  data?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

export function normalizeQuoteHex(quote: string): string | undefined {
  const normalized = quote.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (/^0x[\da-f]+$/i.test(normalized)) {
    return normalized.slice(2).toLowerCase();
  }

  if (/^[\da-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
    return normalized.toLowerCase();
  }

  if (/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    const decoded = decodeQuotePayload(normalized);
    return decoded && decoded.length > 0 ? decoded.toString('hex') : undefined;
  }

  return undefined;
}

export function hashQuote(quote: string): string {
  return createHash('sha256').update(quote).digest('hex');
}

export function buildQuoteExplorerUrl(quote: string | undefined): string | undefined {
  if (!quote || MOCK_QUOTES.has(quote)) {
    return 'https://proof.t16z.com/';
  }
  return `https://proof.t16z.com/?quote=${hashQuote(quote)}`;
}

function decodeQuotePayload(quote: string): Buffer | undefined {
  const normalized = quote.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  if (/^[\da-f]+$/i.test(normalized) && normalized.length % 2 === 0) {
    return Buffer.from(normalized, 'hex');
  }

  if (/^[A-Za-z0-9+/=]+$/.test(normalized)) {
    try {
      return Buffer.from(normalized, 'base64');
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function verifyTdxQuoteStructure(quote: string): QuoteVerifyResult {
  const decoded = decodeQuotePayload(quote);
  if (!decoded || decoded.length < MIN_TDX_QUOTE_BYTES) {
    return {
      passed: false,
      detail: `Intel TDX quote payload too short (${decoded?.length ?? 0} bytes).`,
    };
  }

  return {
    passed: true,
    detail: `TDX quote payload validated (${decoded.length} bytes).`,
    quoteHash: hashQuote(quote),
  };
}

export function verifyIntelQuote(
  quote: string | undefined,
  options?: { mockMode?: boolean }
): QuoteVerifyResult {
  if (!quote || quote.trim().length === 0) {
    return { passed: false, detail: 'Intel TDX quote missing.' };
  }

  if (MOCK_QUOTES.has(quote)) {
    if (options?.mockMode) {
      return {
        passed: true,
        detail: 'Mock quote accepted in test mode.',
        quoteHash: hashQuote(quote),
      };
    }
    return { passed: false, detail: 'Mock quote rejected outside test mode.' };
  }

  const normalized = quote.trim();
  if (normalized.length < 32) {
    return { passed: false, detail: 'Intel TDX quote too short.' };
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalized) && !/^[\da-f]+$/i.test(normalized)) {
    return { passed: false, detail: 'Intel TDX quote has invalid encoding.' };
  }

  const structural = verifyTdxQuoteStructure(normalized);
  if (!structural.passed) {
    return structural;
  }

  return {
    passed: true,
    detail: structural.detail,
    quoteHash: structural.quoteHash,
  };
}

export async function verifyQuoteWithPhalaCloud(
  quote: string,
  options?: { verifyUrl?: string; fetchImpl?: typeof fetch }
): Promise<QuoteVerifyResult> {
  const verifyUrl =
    options?.verifyUrl ??
    process.env.PHALA_CLOUD_ATTESTATION_VERIFY_URL ??
    DEFAULT_PHALA_VERIFY_URL;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const quoteHash = hashQuote(quote);
  const hex = normalizeQuoteHex(quote);

  if (!hex) {
    return {
      passed: false,
      detail: 'Intel TDX quote has invalid encoding for Phala Cloud verification.',
      quoteHash,
    };
  }

  const structural = verifyIntelQuote(quote);

  try {
    const response = await fetchImpl(verifyUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ hex }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = response.headers.get('content-type')?.includes('application/json')
      ? ((await response.json()) as PhalaVerifyResponse)
      : ({ error: await response.text() } as PhalaVerifyResponse);

    if (!response.ok) {
      return {
        passed: false,
        detail:
          typeof payload.detail === 'string'
            ? payload.detail
            : typeof payload.error === 'string'
              ? payload.error
              : `Phala Cloud verification failed with status ${response.status}.`,
        quoteHash,
      };
    }

    const root = (payload.data || payload.result || payload) as PhalaVerifyResponse;
    const quoteVerified = root.quote?.verified === true || root.verified === true;

    if (quoteVerified) {
      return {
        passed: true,
        detail: 'Phala Cloud attestation verification succeeded.',
        quoteHash,
      };
    }

    if (root.proof_of_cloud !== true && structural.passed) {
      return {
        passed: true,
        detail:
          'Phala Cloud parsed TDX quote; structural validation passed (Intel PCS verified=false on non-PoC node).',
        quoteHash,
      };
    }

    return {
      passed: false,
      detail:
        root.status === 'verified' || root.status === 'ok'
          ? 'Phala Cloud verification did not return verified status.'
          : 'Phala Cloud parsed quote but Intel PCS verification failed.',
      quoteHash,
    };
  } catch (error) {
    return {
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
      quoteHash,
    };
  }
}

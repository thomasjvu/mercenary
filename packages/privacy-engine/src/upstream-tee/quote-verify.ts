import { createHash } from 'node:crypto';

const MOCK_QUOTES = new Set(['mock-intel-quote', 'mock-tdx-quote']);

export type QuoteVerifyResult = {
  passed: boolean;
  detail: string;
  quoteHash?: string;
};

export function hashQuote(quote: string): string {
  return createHash('sha256').update(quote).digest('hex');
}

export function buildQuoteExplorerUrl(quote: string | undefined): string | undefined {
  if (!quote || MOCK_QUOTES.has(quote)) {
    return 'https://proof.t16z.com/';
  }
  return `https://proof.t16z.com/?quote=${hashQuote(quote)}`;
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

  return {
    passed: true,
    detail: 'Intel TDX quote structure validated.',
    quoteHash: hashQuote(normalized),
  };
}

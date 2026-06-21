import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readTeeSocketPath, TEE } from '@bossraid/constants';
import { verifyIntelQuote, verifyQuoteWithPhalaCloud } from './upstream-tee/quote-verify.js';
import type {
  PrivacyAttestation,
  PrivacyFeatureKey,
  TeeAttestationResult,
} from '@bossraid/shared-types';

const LEGACY_TAPPD_SOCKET_PATH = '/var/run/tappd.sock';
const DEFAULT_TEE_VENDOR = TEE.DEFAULT_VENDOR;
const DEFAULT_RUNTIME_MODE = TEE.DEFAULT_RUNTIME_MODE;
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;

export interface TeeAttestationOptions {
  providerId: string;
  socketPath?: string;
  cache?: Map<string, { result: TeeAttestationResult; expiresAt: number }>;
  cacheTtlMs?: number;
}

export interface PrivacyAttestationOptions {
  providerId: string;
  raidId: string;
  featuresClaimed: PrivacyFeatureKey[];
  featuresVerified: PrivacyFeatureKey[];
  teeAttestation?: TeeAttestationResult;
  externalApiCalls?: string[];
  dataRetained?: boolean;
}

export interface PhalaTeeAttestationOptions {
  reportData?: string;
  runtimeMode?: string;
  rpcTimeoutMs?: number;
  getQuoteTimeoutMs?: number;
  skipCloudVerify?: boolean;
}

const hostAttestationInFlight = new Map<string, Promise<TeeAttestationResult>>();

type PhalaInfoResponse = {
  app_id?: string;
  instance_id?: string;
  app_name?: string;
  device_id?: string;
  compose_hash?: string;
  os_image_hash?: string;
  tcb_info?: string | Record<string, unknown>;
};

type PhalaQuoteResponse = {
  quote?: string;
  event_log?: string;
  report_data?: string;
  vm_config?: string;
  error?: string;
};

async function verifyPhalaTeeAttestation(
  providerId: string,
  socketPath = '',
  cache: Map<string, { result: TeeAttestationResult; expiresAt: number }> = new Map(),
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  opts: PhalaTeeAttestationOptions = {}
): Promise<TeeAttestationResult> {
  const reportData = opts.reportData ?? `bossraid-provider:${providerId}`;
  const cacheKey = `tee:${providerId}:${createHash('sha256').update(reportData).digest('hex')}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const inFlight = hostAttestationInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const verification = callPhalaAttestationApi(providerId, socketPath, {
    ...opts,
    reportData,
  }).then((result) => {
    hostAttestationInFlight.delete(cacheKey);
    if (result.valid) {
      cache.set(cacheKey, { result, expiresAt: now + cacheTtlMs });
    }
    return result;
  });
  hostAttestationInFlight.set(cacheKey, verification);
  return verification;
}

async function callPhalaAttestationApi(
  providerId: string,
  socketPath: string,
  opts: PhalaTeeAttestationOptions & { reportData: string }
): Promise<TeeAttestationResult> {
  try {
    const endpoint = resolvePhalaEndpoint(socketPath);
    const infoTimeoutMs = opts.rpcTimeoutMs ?? 30_000;
    const quoteTimeoutMs = opts.getQuoteTimeoutMs ?? infoTimeoutMs;
    const info = await phalaRpc<PhalaInfoResponse>(endpoint, '/Info', {}, infoTimeoutMs);
    const reportData = buildReportData(opts.reportData);
    const quote = await phalaRpc<PhalaQuoteResponse>(
      endpoint,
      '/GetQuote',
      {
        report_data: reportData.hex,
      },
      quoteTimeoutMs
    );
    if (quote.error) {
      throw new Error(quote.error);
    }
    if (!quote.quote) {
      throw new Error('Phala dstack did not return a TDX quote.');
    }
    const verification = opts.skipCloudVerify
      ? verifyIntelQuote(quote.quote)
      : await verifyQuoteWithPhalaCloud(quote.quote);
    const verifiedAt = new Date().toISOString();
    const runtimeMode =
      opts.runtimeMode || process.env.BOSSRAID_TEE_RUNTIME_MODE || DEFAULT_RUNTIME_MODE;
    const tcbInfo = parseTcbInfo(info.tcb_info);
    const quoteHash = createHash('sha256').update(quote.quote).digest('hex');
    return {
      valid: verification.passed,
      providerId,
      verifiedAt,
      expiresAt: new Date(Date.now() + DEFAULT_CACHE_TTL_MS).toISOString(),
      vendor: DEFAULT_TEE_VENDOR,
      runtimeMode,
      enclaveHash: stringField(info.compose_hash) ?? stringField(tcbInfo?.mrtd) ?? quoteHash,
      signature: quote.quote,
      notes: [
        'phala-dstack-tdx-quote',
        opts.skipCloudVerify
          ? verification.passed
            ? 'tdx-quote-structural-verified'
            : 'tdx-quote-structural-unverified'
          : verification.passed
            ? 'phala-cloud-verified'
            : 'phala-cloud-unverified',
        `endpoint:${redactEndpoint(endpoint)}`,
        ...(info.app_id ? [`app_id:${info.app_id}`] : []),
        ...(info.instance_id ? [`instance_id:${info.instance_id}`] : []),
        ...(info.device_id ? [`device_id:${info.device_id}`] : []),
        ...(info.os_image_hash ? [`os_image_hash:${info.os_image_hash}`] : []),
        ...(quote.report_data ? [`report_data:${quote.report_data}`] : []),
        ...(!verification.passed ? [`verification_error:${verification.detail}`] : []),
      ],
    };
  } catch (error) {
    return {
      valid: false,
      providerId,
      verifiedAt: new Date().toISOString(),
      vendor: 'phala',
      runtimeMode:
        opts.runtimeMode || process.env.BOSSRAID_TEE_RUNTIME_MODE || DEFAULT_RUNTIME_MODE,
      notes: [
        'phala-dstack-attestation-failed',
        error instanceof Error ? error.message : String(error),
      ],
    };
  }
}

function buildReportData(value: string): { hex: string } {
  const raw = Buffer.from(value, 'utf8');
  if (raw.length <= 64) {
    return { hex: raw.toString('hex') };
  }
  return { hex: createHash('sha256').update(raw).digest('hex') };
}

function isReachablePhalaEndpoint(candidate: string): boolean {
  if (/^https?:\/\//i.test(candidate)) {
    return true;
  }
  return existsSync(candidate);
}

function resolvePhalaEndpoint(socketPath: string): string {
  if (socketPath && isReachablePhalaEndpoint(socketPath)) {
    return socketPath;
  }

  const candidates = [
    process.env.DSTACK_SIMULATOR_ENDPOINT,
    process.env.TAPPD_SIMULATOR_ENDPOINT,
    process.env.DSTACK_ENDPOINT,
    process.env.TAPPD_ENDPOINT,
    process.env.TAPPD_SOCKET_PATH,
    process.env.BOSSRAID_TEE_SOCKET_PATH,
    process.env.DSTACK_SOCKET_PATH,
    readTeeSocketPath(process.env),
    LEGACY_TAPPD_SOCKET_PATH,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const endpoint = candidates.find((candidate) => isReachablePhalaEndpoint(candidate));
  if (!endpoint) {
    throw new Error('No reachable Phala dstack or tappd endpoint was found.');
  }
  return endpoint;
}

function redactEndpoint(endpoint: string): string {
  return /^https?:\/\//i.test(endpoint) ? new URL(endpoint).origin : endpoint;
}

function phalaRpc<T>(
  endpoint: string,
  path: string,
  body: unknown,
  timeoutMs = 30_000
): Promise<T> {
  const payload = JSON.stringify(body);
  const request = /^https?:\/\//i.test(endpoint)
    ? phalaHttpRpc<T>(endpoint, path, payload, timeoutMs)
    : phalaUnixRpc<T>(endpoint, path, payload, timeoutMs);

  return Promise.race([
    request,
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Phala dstack ${path} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    }),
  ]);
}

function phalaHttpRpc<T>(
  endpoint: string,
  path: string,
  payload: string,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, endpoint);
    const request = (url.protocol === 'https:' ? https : http).request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error('Phala dstack returned invalid JSON.'));
          }
        });
      }
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Phala dstack request timed out.'));
    });
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function phalaUnixRpc<T>(
  socketPath: string,
  path: string,
  payload: string,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let buffer = '';
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(error);
      }
    };
    socket.setTimeout(timeoutMs, () => fail(new Error('Phala dstack request timed out.')));
    socket.on('connect', () => {
      socket.write(`POST ${path} HTTP/1.1\r\n`);
      socket.write('Host: dstack\r\n');
      socket.write('Content-Type: application/json\r\n');
      socket.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n`);
      socket.write('\r\n');
      socket.write(payload);
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }
      const headerText = buffer.slice(0, headerEnd);
      const match = headerText.match(/^content-length:\s*(\d+)$/im);
      const contentLength = match ? Number(match[1]) : 0;
      const body = buffer.slice(headerEnd + 4);
      if (body.length < contentLength) {
        return;
      }
      try {
        settled = true;
        socket.end();
        resolve(JSON.parse(body.slice(0, contentLength)) as T);
      } catch {
        fail(new Error('Phala dstack returned invalid JSON.'));
      }
    });
    socket.on('error', fail);
  });
}

function parseTcbInfo(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function buildSignedDeclaration(opts: PrivacyAttestationOptions): string {
  const parts = [
    opts.providerId,
    opts.raidId,
    opts.featuresClaimed.join(','),
    opts.featuresVerified.join(','),
    opts.teeAttestation?.valid ? 'attested' : 'unattested',
    String(opts.externalApiCalls?.length ?? 0),
    String(opts.dataRetained ?? false),
  ];
  return `PRIVACY_DECLARATION:${parts.join('|')}`;
}

export function buildPrivacyAttestation(opts: PrivacyAttestationOptions): PrivacyAttestation {
  const declaration = buildSignedDeclaration(opts);
  return {
    providerId: opts.providerId,
    raidId: opts.raidId,
    submittedAt: new Date().toISOString(),
    featuresClaimed: opts.featuresClaimed,
    featuresVerified: opts.featuresVerified,
    teeAttestation: opts.teeAttestation,
    externalApiCalls: opts.externalApiCalls ?? [],
    dataRetained: opts.dataRetained ?? false,
    signedDeclaration: declaration,
  };
}

export { verifyPhalaTeeAttestation };

export const DEFAULT_API_BASE = 'http://127.0.0.1:8787';

export function parseCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    index += 1;
  }
  return args;
}

export function readCliArg(args, key) {
  const value = args.get(key);
  return value === 'true' ? undefined : value;
}

export function resolveApiBase(cliApiBase, env = process.env) {
  const candidates = [
    cliApiBase,
    env.BOSSRAID_E2E_API_BASE,
    env.BOSSRAID_API_BASE,
    env.BOSSRAID_BOUNTY_E2E_API_BASE,
    env.BOSSRAID_X402_E2E_API_BASE,
    env.VITE_BOSSRAID_API_BASE,
    DEFAULT_API_BASE,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return DEFAULT_API_BASE;
}

export function buildApiUrl(base, path) {
  return new URL(path.replace(/^\/+/, ''), base.endsWith('/') ? base : `${base}/`).toString();
}

export function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
}

export function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

export async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatBody(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

export function normalizeHexPrivateKey(value) {
  return value.startsWith('0x') ? value : `0x${value}`;
}
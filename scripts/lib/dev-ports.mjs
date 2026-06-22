import { execSync } from 'node:child_process';

export const CORE_DEV_PORTS = [4173, 4174, 4175, 8787, 8790];

export function collectProviderPorts(providerProfiles) {
  const ports = new Set(CORE_DEV_PORTS);
  let spawnIndex = 0;

  for (const profile of providerProfiles) {
    if (profile.spawnWorker === false) {
      continue;
    }
    const endpoint = new URL(profile.endpoint);
    ports.add(Number(endpoint.port) || 9001 + spawnIndex);
    spawnIndex += 1;
  }

  return [...ports].sort((a, b) => a - b);
}

export function findListeningPids(port) {
  if (process.platform === 'win32') {
    return [];
  }

  try {
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!output) {
      return [];
    }
    return output
      .split('\n')
      .map((value) => Number.parseInt(value, 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

export function freePorts(ports, options = {}) {
  const { label = 'dev', signal = 'SIGTERM' } = options;
  const killed = new Set();

  for (const port of ports) {
    for (const pid of findListeningPids(port)) {
      if (killed.has(pid)) {
        continue;
      }
      try {
        process.kill(pid, signal);
        killed.add(pid);
      } catch {
        // Process may have already exited.
      }
    }
  }

  if (killed.size > 0) {
    console.log(`[${label}] freed ${killed.size} stale process(es) on dev ports`);
  }

  return killed.size;
}

import { spawn } from 'node:child_process';

export function spawnDevProcess(command, args, options = {}) {
  const { cwd, env, stdio = 'inherit' } = options;
  return spawn(command, args, {
    cwd,
    env,
    stdio,
    detached: process.platform !== 'win32',
  });
}

export function killProcessTree(child, signal = 'SIGTERM') {
  if (!child?.pid || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

import { spawn } from 'node:child_process';

export async function runCommand(rootDir, env, command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} exited via signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 0}`));
        return;
      }
      resolvePromise(undefined);
    });
  });
}

export async function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise((resolvePromise) => {
    child.once('close', () => resolvePromise(undefined));
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 2_000);
  });
}

export function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
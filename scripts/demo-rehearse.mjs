import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const apiBase =
  process.env.BOSSRAID_X402_E2E_API_BASE ??
  process.env.BOSSRAID_API_BASE ??
  process.env.VITE_BOSSRAID_API_BASE ??
  "http://127.0.0.1:8787";
const webBase = process.env.BOSSRAID_WEB_BASE ?? "http://127.0.0.1:4173";
const opsBase = process.env.BOSSRAID_OPS_BASE ?? "http://127.0.0.1:4174";

const rehearsalEnv = {
  ...process.env,
  BOSSRAID_STORAGE_BACKEND: process.env.BOSSRAID_STORAGE_BACKEND ?? "sqlite",
  BOSSRAID_PROVIDERS_FILE: process.env.BOSSRAID_PROVIDERS_FILE ?? "./examples/providers.http.json",
  BOSSRAID_SQLITE_FILE: process.env.BOSSRAID_SQLITE_FILE ?? "./temp/bossraid-demo.sqlite",
  VITE_BOSSRAID_API_BASE: process.env.VITE_BOSSRAID_API_BASE ?? apiBase,
  BOSSRAID_X402_ENABLED: process.env.BOSSRAID_X402_ENABLED ?? "true",
  BOSSRAID_X402_VERIFY_HMAC_SECRET: process.env.BOSSRAID_X402_VERIFY_HMAC_SECRET ?? "local-dev-only",
  BOSSRAID_X402_PAY_TO:
    process.env.BOSSRAID_X402_PAY_TO ?? "0x0000000000000000000000000000000000000001",
  BOSSRAID_X402_RAID_PRICE_USD: process.env.BOSSRAID_X402_RAID_PRICE_USD ?? "0.01",
  BOSSRAID_X402_CHAT_PRICE_USD: process.env.BOSSRAID_X402_CHAT_PRICE_USD ?? "0.002",
  BOSSRAID_X402_E2E_API_BASE: apiBase,
};

let devChild;
let devStackExitError;
let stoppingDevStack = false;

process.on("SIGINT", () => {
  void stopDevStack();
});

process.on("SIGTERM", () => {
  void stopDevStack();
});

try {
  if (!rehearsalEnv.BOSSRAID_MODEL_API_KEY || !rehearsalEnv.BOSSRAID_MODEL) {
    throw new Error(
      "BOSSRAID_MODEL_API_KEY and BOSSRAID_MODEL are required for pnpm demo:rehearse because the local providers must become ready.",
    );
  }

  console.log(JSON.stringify({ step: "check" }, null, 2));
  await runCommand("pnpm", ["check"]);

  console.log(JSON.stringify({ step: "build" }, null, 2));
  await runCommand("pnpm", ["build"]);

  console.log(JSON.stringify({ step: "api_tests" }, null, 2));
  await runCommand("pnpm", ["--filter", "@bossraid/api", "test"]);

  console.log(JSON.stringify({ step: "orchestrator_tests" }, null, 2));
  await runCommand("pnpm", ["--filter", "@bossraid/orchestrator", "test"]);

  console.log(JSON.stringify({ step: "start_stack" }, null, 2));
  devChild = spawn("node", ["scripts/dev-stack.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
    env: rehearsalEnv,
  });
  devChild.on("close", (code, signal) => {
    if (stoppingDevStack) {
      return;
    }

    devStackExitError = new Error(
      `Local stack exited before readiness or rehearsal completion (code: ${code ?? "unknown"}, signal: ${signal ?? "none"}).`,
    );
  });

  await waitForJson(`${apiBase}/health`, (body) => body?.readyProviders > 0, "api health");
  await waitForHttp(webBase, "public web");
  await waitForHttp(opsBase, "ops web");

  console.log(JSON.stringify({ step: "x402_raid_hmac" }, null, 2));
  await runCommand("pnpm", ["test:x402:e2e", "--", "--mode", "hmac", "--route", "raid"]);

  console.log(JSON.stringify({ step: "x402_chat_hmac" }, null, 2));
  await runCommand("pnpm", ["test:x402:e2e", "--", "--mode", "hmac", "--route", "chat"]);

  console.log(JSON.stringify({ step: "mcp_delegate_hmac" }, null, 2));
  await runCommand("pnpm", ["test:mcp:e2e"]);

  console.log(
    JSON.stringify(
      {
        step: "complete",
        apiBase,
        webBase,
        opsBase,
      },
      null,
      2,
    ),
  );
} finally {
  await stopDevStack();
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      env: rehearsalEnv,
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} exited via signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 0}`));
        return;
      }

      resolve(undefined);
    });
  });
}

async function waitForJson(url, predicate, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (devStackExitError) {
      throw devStackExitError;
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json();
        if (predicate(body)) {
          console.log(JSON.stringify({ step: "ready", label, url, body }, null, 2));
          return;
        }
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function waitForHttp(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (devStackExitError) {
      throw devStackExitError;
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(JSON.stringify({ step: "ready", label, url }, null, 2));
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function stopDevStack() {
  if (!devChild || devChild.killed || devChild.exitCode !== null || devChild.signalCode !== null) {
    return;
  }

  stoppingDevStack = true;
  await new Promise((resolve) => {
    devChild.once("close", () => resolve(undefined));
    devChild.kill("SIGTERM");
    setTimeout(() => {
      if (!devChild.killed) {
        devChild.kill("SIGKILL");
      }
    }, 2_000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

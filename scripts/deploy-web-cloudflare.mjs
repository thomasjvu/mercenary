import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(repoRoot, "apps/web");

const pagesProject = readRequiredEnv("BOSSRAID_CLOUDFLARE_PAGES_PROJECT");
const apiOrigin = normalizeApiOrigin(readRequiredEnv("BOSSRAID_API_ORIGIN"));
const pagesBranch = normalizeOptionalEnv("BOSSRAID_CLOUDFLARE_PAGES_BRANCH");

await runCommand("npx", ["wrangler", "whoami"], { cwd: repoRoot });
await runCommand("pnpm", ["--filter", "@bossraid/web", "build"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    VITE_BOSSRAID_API_BASE: apiOrigin,
    VITE_BOSSRAID_WEB_API_BASE: "/api",
  },
});
await runCommand(
  "npx",
  ["wrangler", "pages", "secret", "put", "BOSSRAID_API_ORIGIN", "--project-name", pagesProject],
  {
    cwd: webDir,
    input: apiOrigin,
  },
);

const deployArgs = ["wrangler", "pages", "deploy", "dist", "--project-name", pagesProject];
if (pagesBranch) {
  deployArgs.push("--branch", pagesBranch);
}

await runCommand("npx", deployArgs, { cwd: webDir });

function readRequiredEnv(name) {
  const value = normalizeOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeOptionalEnv(name) {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeApiOrigin(value) {
  const origin = new URL(value);
  if (isIpv4Address(origin.hostname)) {
    origin.hostname = `${origin.hostname}.nip.io`;
  }
  const pathname = origin.pathname.endsWith("/") ? origin.pathname.slice(0, -1) : origin.pathname;
  origin.pathname = pathname || "/";
  origin.search = "";
  origin.hash = "";
  return origin.toString().replace(/\/$/, pathname === "/" ? "" : pathname);
}

function isIpv4Address(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function runCommand(command, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "inherit", "inherit"],
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

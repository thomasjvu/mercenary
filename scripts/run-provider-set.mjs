import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);
const inheritedEnv = process.env;
const providersFile = resolve(rootDir, inheritedEnv.BOSSRAID_PROVIDERS_FILE ?? "./examples/providers.http.json");
const providerProfiles = JSON.parse(readFileSync(providersFile, "utf8"));

if (!Array.isArray(providerProfiles) || providerProfiles.length === 0) {
  throw new Error(`No provider profiles found in ${providersFile}.`);
}

const children = providerProfiles.map((profile, index) => {
  const endpoint = new URL(profile.endpoint);
  const mode = inferProviderMode(profile);
  const keyEnv = resolveProviderKeyEnv(profile, mode);
  const providerModelApiKey = keyEnv ? inheritedEnv[keyEnv] : undefined;
  const usingVenice = Boolean(providerModelApiKey) || String(profile.modelFamily ?? "").toLowerCase().includes("venice");
  const providerModelApiBase = usingVenice
    ? inheritedEnv.BOSSRAID_VENICE_API_BASE ?? inheritedEnv.VENICE_API_BASE ?? "https://api.venice.ai/api/v1"
    : inheritedEnv.BOSSRAID_MODEL_API_BASE;
  const providerModel = usingVenice
    ? inheritedEnv.BOSSRAID_VENICE_MODEL ?? inheritedEnv.VENICE_MODEL ?? "minimax-m27"
    : inheritedEnv.BOSSRAID_MODEL;

  const child = spawn("node", ["apps/provider-agent/dist/apps/provider-agent/src/index.js"], {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...inheritedEnv,
      PORT: String(endpoint.port || 9001 + index),
      BOSSRAID_PROVIDER_ID: profile.providerId,
      BOSSRAID_PROVIDER_NAME: profile.displayName,
      BOSSRAID_PROVIDER_TOKEN: profile.auth?.token ?? inheritedEnv.BOSSRAID_PROVIDER_TOKEN,
      BOSSRAID_CALLBACK_TOKEN: profile.auth?.token ?? inheritedEnv.BOSSRAID_CALLBACK_TOKEN ?? inheritedEnv.BOSSRAID_PROVIDER_TOKEN,
      BOSSRAID_PROVIDER_AUTH_TYPE: profile.auth?.type ?? inheritedEnv.BOSSRAID_PROVIDER_AUTH_TYPE,
      BOSSRAID_PROVIDER_INSTRUCTIONS: buildProviderInstructions(profile, mode),
      BOSSRAID_PROVIDER_MODE: mode,
      BOSSRAID_MODEL_API_KEY: providerModelApiKey ?? inheritedEnv.BOSSRAID_MODEL_API_KEY,
      BOSSRAID_MODEL: providerModel,
      BOSSRAID_MODEL_API_BASE: providerModelApiBase,
      BOSSRAID_MODEL_REASONING_EFFORT:
        inheritedEnv.BOSSRAID_MODEL_REASONING_EFFORT ?? inheritedEnv.VENICE_REASONING_EFFORT ?? "medium",
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[providers] ${profile.providerId} exited via signal ${signal}`);
      return;
    }
    console.log(`[providers] ${profile.providerId} exited with code ${code ?? 0}`);
  });

  return child;
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[providers] shutting down on ${signal}`);
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => {
    process.exit(0);
  }, 250);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function inferProviderMode(profile) {
  const tags = [
    ...(Array.isArray(profile.specializations) ? profile.specializations : []),
    ...(Array.isArray(profile.supportedFrameworks) ? profile.supportedFrameworks : []),
  ].map((value) => String(value).toLowerCase());

  if (tags.includes("gb-studio")) {
    return "gbstudio";
  }
  if (tags.includes("pixel-art")) {
    return "pixel_art";
  }
  if (tags.includes("remotion")) {
    return "remotion";
  }
  return "generic";
}

function resolveProviderKeyEnv(profile, mode) {
  if (typeof profile.modelApiKeyEnv === "string" && inheritedEnv[profile.modelApiKeyEnv]) {
    return profile.modelApiKeyEnv;
  }

  const candidates = new Set();
  const displayName = String(profile.displayName ?? "").toLowerCase();
  const providerId = String(profile.providerId ?? "").toLowerCase();

  if (mode === "gbstudio" || displayName.includes("gamma") || providerId.includes("gamma") || providerId.includes("regression-averse")) {
    candidates.add("VENICE_API_KEY_GAMMA");
  }
  if (mode === "remotion" || displayName.includes("riko") || providerId.includes("riko") || providerId.includes("minimal-diff")) {
    candidates.add("VENICE_API_KEY_RIKO");
  }
  if (mode === "pixel_art" || displayName.includes("dottie") || providerId.includes("dottie") || providerId.includes("unity-specialist")) {
    candidates.add("VENICE_API_KEY_DOTTIE");
  }

  for (const candidate of candidates) {
    if (inheritedEnv[candidate]) {
      return candidate;
    }
  }
  return undefined;
}

function buildProviderInstructions(profile, mode) {
  if (mode === "gbstudio") {
    return "Specialize in small game-development slices, gameplay logic, and minimal repo patches that keep one clear hook.";
  }
  if (mode === "pixel_art") {
    return "Specialize in pixel-art asset packs, spritesheets, UI frames, and compact retro palettes.";
  }
  if (mode === "remotion") {
    return "Specialize in game marketing videos, teaser hooks, launch copy, storyboard beats, and Remotion-ready promo bundles.";
  }
  return profile.description ?? "Specialize in precise scoped contributions for Mercenary.";
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(
  workspaceRoot,
  process.env.BOSSRAID_ACP_CONFIG_PATH ?? "temp/openclaw-acp-work/config.json"
);
const outputPath = resolve(
  workspaceRoot,
  process.env.BOSSRAID_ACP_SELLER_ENV_OUT ?? "temp/acp-sellers.phala.env"
);
const imageTag =
  process.env.BOSSRAID_ACP_SELLER_IMAGE ?? "docker.io/<user>/bossraid-acp-seller:latest";
const socketUrl = process.env.ACP_SOCKET_URL ?? "https://acpx.virtuals.io";
const builderCode = process.env.ACP_BUILDER_CODE ?? "";
const defaultVeniceModel = process.env.VENICE_MODEL ?? "minimax-m27";
if (!existsSync(configPath)) {
  console.error(`Missing ACP config: ${configPath}`);
  process.exit(1);
}

const rawConfig = JSON.parse(readFileSync(configPath, "utf8"));
const agents = Array.isArray(rawConfig.agents) ? rawConfig.agents : [];
const requiredAgents = [
  { name: "Gamma", envKey: "ACP_GAMMA_API_KEY" },
  { name: "Riko", envKey: "ACP_RIKO_API_KEY" },
  { name: "Dottie", envKey: "ACP_DOTTIE_API_KEY" },
];

const lines = [
  "# Generated from the local ACP config. Treat this file as secret.",
  `BOSSRAID_ACP_SELLER_IMAGE=${imageTag}`,
  `ACP_SOCKET_URL=${socketUrl}`,
  `ACP_BUILDER_CODE=${builderCode}`,
];

for (const { name, envKey } of requiredAgents) {
  const agent = agents.find((candidate) => candidate?.name === name);
  const apiKey = typeof agent?.apiKey === "string" ? agent.apiKey.trim() : "";
  if (!apiKey) {
    console.error(`Missing ACP API key for agent "${name}" in ${configPath}`);
    process.exit(1);
  }
  lines.push(`${envKey}=${apiKey}`);
}

const derivedEnv = {
  VENICE_API_KEY_GAMMA:
    process.env.VENICE_API_KEY_GAMMA ?? process.env.VENICE_API_KEY ?? "",
  VENICE_API_KEY_RIKO:
    process.env.VENICE_API_KEY_RIKO ?? process.env.VENICE_API_KEY ?? "",
  VENICE_API_KEY_DOTTIE:
    process.env.VENICE_API_KEY_DOTTIE ?? process.env.VENICE_API_KEY ?? "",
};

for (const [envKey, value] of Object.entries(derivedEnv)) {
  if (typeof value === "string" && value.length > 0) {
    lines.push(`${envKey}=${value}`);
  }
}

lines.push(`VENICE_API_BASE=${process.env.VENICE_API_BASE ?? "https://api.venice.ai/api/v1"}`);
lines.push(`VENICE_MODEL=${defaultVeniceModel}`);
lines.push(`VENICE_MODEL_GAMMA=${process.env.VENICE_MODEL_GAMMA ?? defaultVeniceModel}`);
lines.push(`VENICE_MODEL_RIKO=${process.env.VENICE_MODEL_RIKO ?? defaultVeniceModel}`);
lines.push(`VENICE_MODEL_DOTTIE=${process.env.VENICE_MODEL_DOTTIE ?? defaultVeniceModel}`);
lines.push(`VENICE_REASONING_EFFORT=${process.env.VENICE_REASONING_EFFORT ?? "medium"}`);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ACP seller env to ${outputPath}`);

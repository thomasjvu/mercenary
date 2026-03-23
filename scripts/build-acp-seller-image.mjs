import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const acpRepoPath = resolve(
  workspaceRoot,
  process.env.BOSSRAID_ACP_REPO_PATH ?? "temp/openclaw-acp-work"
);
const stagingPath = resolve(
  workspaceRoot,
  process.env.BOSSRAID_ACP_SELLER_CONTEXT_OUT ?? "temp/acp-seller-build"
);
const dockerfilePath = resolve(workspaceRoot, "deploy/acp-seller/Dockerfile");
const imageTag = process.env.BOSSRAID_ACP_SELLER_IMAGE ?? "bossraid-acp-seller:local";
const platform = process.env.BOSSRAID_ACP_SELLER_PLATFORM ?? "linux/amd64";

const requiredEntries = ["package.json", "tsconfig.json", "bin", "src"];
for (const entry of requiredEntries) {
  const absolutePath = resolve(acpRepoPath, entry);
  if (!existsSync(absolutePath)) {
    console.error(`Missing ACP runtime entry: ${absolutePath}`);
    process.exit(1);
  }
}

if (!existsSync(dockerfilePath)) {
  console.error(`Missing Dockerfile: ${dockerfilePath}`);
  process.exit(1);
}

rmSync(stagingPath, { force: true, recursive: true });
mkdirSync(stagingPath, { recursive: true });

const copyEntries = ["package.json", "tsconfig.json", "bin", "src"];
if (existsSync(resolve(acpRepoPath, "package-lock.json"))) {
  copyEntries.splice(1, 0, "package-lock.json");
}

for (const entry of copyEntries) {
  cpSync(resolve(acpRepoPath, entry), resolve(stagingPath, entry), { recursive: true });
}

console.log(`Building ACP seller image from ${acpRepoPath}`);
console.log(`Staged sanitized context at ${stagingPath}`);
console.log(`Target image: ${imageTag}`);

const build = spawnSync(
  "docker",
  ["build", "--platform", platform, "-f", dockerfilePath, "-t", imageTag, stagingPath],
  {
    cwd: workspaceRoot,
    stdio: "inherit",
  }
);

if (typeof build.status === "number" && build.status !== 0) {
  process.exit(build.status);
}

if (build.error) {
  console.error(build.error.message);
  process.exit(1);
}

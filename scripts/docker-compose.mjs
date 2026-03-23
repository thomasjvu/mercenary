import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadDockerImageEnv, rootDir } from "./docker-images.mjs";

const args = process.argv.slice(2);
const dockerSocketSource = resolveDockerSocketSource();
const { evaluatorJobImage, isolationMode } = loadDockerImageEnv();

if (isolationMode === "container" && !dockerSocketSource) {
  console.error("Unable to resolve a Docker socket path for evaluator container isolation. Set BOSSRAID_DOCKER_SOCKET_SOURCE or disable BOSSRAID_EVAL_JOB_ISOLATION=container.");
  process.exit(1);
}

const env = {
  ...process.env,
  ...(dockerSocketSource
    ? {
        BOSSRAID_DOCKER_SOCKET_SOURCE: dockerSocketSource,
        ...(statSync(dockerSocketSource).gid === 0
          ? {}
          : { BOSSRAID_DOCKER_SOCKET_GID: String(statSync(dockerSocketSource).gid) }),
      }
    : {}),
};

ensureEvaluatorJobImage(args, evaluatorJobImage, env);

const result = spawnSync("docker", ["compose", ...args], {
  cwd: rootDir,
  stdio: "inherit",
  env,
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 0);

function ensureEvaluatorJobImage(args, image, env) {
  if (isolationMode !== "container" || !shouldBuildEvaluatorJobImage(args, image, env)) {
    return;
  }

  const result = spawnSync("docker", ["build", "--target", "evaluator-job", "-t", image, "."], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function shouldBuildEvaluatorJobImage(args, image, env) {
  const command = args.find((arg) => !arg.startsWith("-"));
  if (!command || !["up", "create", "start"].includes(command)) {
    return false;
  }
  if (args.includes("--build")) {
    return true;
  }

  const inspect = spawnSync("docker", ["image", "inspect", image], {
    cwd: rootDir,
    stdio: "ignore",
    env,
  });
  return inspect.status !== 0;
}

function resolveDockerSocketSource() {
  if (process.env.BOSSRAID_DOCKER_SOCKET_SOURCE && existsSync(process.env.BOSSRAID_DOCKER_SOCKET_SOURCE)) {
    return process.env.BOSSRAID_DOCKER_SOCKET_SOURCE;
  }

  const dockerHost = resolveDockerHost();
  if (dockerHost?.startsWith("unix://")) {
    const socketPath = dockerHost.slice("unix://".length);
    if (existsSync(socketPath)) {
      return socketPath;
    }
  }

  const fallbackPaths = [
    "/var/run/docker.sock",
    resolve(homedir(), ".docker/run/docker.sock"),
  ];
  return fallbackPaths.find((path) => existsSync(path));
}

function resolveDockerHost() {
  if (process.env.DOCKER_HOST) {
    return process.env.DOCKER_HOST;
  }

  const result = spawnSync("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return undefined;
  }
}

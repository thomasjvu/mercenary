import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./env.mjs";

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function loadDockerImageEnv() {
  loadLocalEnv(rootDir);

  return {
    appImage: process.env.BOSSRAID_IMAGE ?? "bossraid:local",
    evaluatorImage: process.env.BOSSRAID_EVALUATOR_IMAGE ?? "bossraid-evaluator:local",
    evaluatorJobImage: process.env.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE ?? "bossraid-evaluator-job:local",
    isolationMode: process.env.BOSSRAID_EVAL_JOB_ISOLATION ?? "container",
  };
}

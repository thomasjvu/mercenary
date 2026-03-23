import { spawnSync } from "node:child_process";
import { loadDockerImageEnv, rootDir } from "./docker-images.mjs";

const { appImage, evaluatorImage, evaluatorJobImage } = loadDockerImageEnv();

buildImage("runtime", appImage);
buildImage("evaluator-runtime", evaluatorImage);
buildImage("evaluator-job", evaluatorJobImage);

function buildImage(target, image) {
  const result = spawnSync("docker", ["build", "--target", target, "-t", image, "."], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

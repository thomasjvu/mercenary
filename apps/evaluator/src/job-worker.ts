import { cleanupWorkspace, materializeWorkspace, runLocalBuildProbe, runLocalTestProbe } from "@bossraid/sandbox-runner";
import type { RuntimeProbeInput, RuntimeProbeResult } from "@bossraid/shared-types";

export async function executeRuntimeProbeJob(input: RuntimeProbeInput): Promise<RuntimeProbeResult> {
  let workspacePath: string | undefined;
  try {
    workspacePath = await materializeWorkspace(input.files);
    return {
      build: await runLocalBuildProbe(input.task, workspacePath, input.touchedFiles),
      tests: await runLocalTestProbe(input.task, workspacePath),
    };
  } finally {
    if (workspacePath) {
      await cleanupWorkspace(workspacePath);
    }
  }
}

async function readStdin(): Promise<string> {
  let body = "";
  for await (const chunk of process.stdin) {
    body += chunk.toString("utf8");
  }
  return body;
}

async function main() {
  const body = await readStdin();
  const input = JSON.parse(body) as RuntimeProbeInput;
  const result = await executeRuntimeProbeJob(input);
  process.stdout.write(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

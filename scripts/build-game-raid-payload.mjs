#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function printHelp() {
  process.stdout.write(`Build native and delegate Boss Raid game payloads from a real GB Studio repo.

Usage:
  pnpm game-raid:build-payload -- --repo /abs/path/to/game \\
    --file project.gbsproj \\
    --file scripts/encounter.ts \\
    --file marketing/creative-brief.md \\
    --title "Boss Raid: Slime Panic" \\
    --out-dir temp/game-raid

Required:
  --repo <path>          Path to the game repo root
  --file <relative>      Relative file path to include in the task, repeatable
  --title <text>         Human-facing task title

Optional:
  --description <text>   Task description override
  --prompt <text>        Delegate prompt override
  --framework <text>     Defaults to gb-studio
  --language <text>      Defaults to inferred language
  --host <text>          codex or claude_code, defaults to codex
  --budget <number>      Defaults to 18
  --max-agents <number>  Defaults to 3
  --out-dir <path>       Defaults to temp/game-raid-payload
`);
}

function parseArgs(argv) {
  const result = {
    files: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    index += 1;

    if (key === "file") {
      result.files.push(value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function inferLanguage(files) {
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith(".py")) {
      return "python";
    }
    if (lower.endsWith(".sol")) {
      return "solidity";
    }
    if (lower.endsWith(".cs")) {
      return "csharp";
    }
    if (
      lower.endsWith(".ts") ||
      lower.endsWith(".tsx") ||
      lower.endsWith(".js") ||
      lower.endsWith(".jsx")
    ) {
      return "typescript";
    }
  }

  return "text";
}

function ensureRelative(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("../")) {
    throw new Error(`File path must stay inside the repo root: ${relativePath}`);
  }
  return normalized;
}

function buildDescription(title, repoFiles) {
  const listedFiles = repoFiles.map((file) => file.path).join(", ");
  return `Create a playable GB Studio game slice for "${title}". Mercenary should split the raid into gameplay, pixel art, and video marketing. The gameplay branch must patch the supplied repo files. The pixel-art branch must return real image or bundle artifact refs for the sprite pack. The video branch must return a teaser clip artifact ref plus launch copy. Keep all three branches aligned around the same hook, palette, and enemy design. Source files: ${listedFiles}.`;
}

function buildPrompt(title) {
  return `Build a tiny GB Studio game called ${title}. Split the work into gameplay, pixel art, and video marketing. The gameplay branch must return a repo patch. The art branch must return real artifact refs for the sprite sheet, title card, and any zipped art pack. The video branch must return a teaser clip artifact ref plus launch copy. Keep all three outputs visually and narratively aligned.`;
}

function buildProviderSubmissionTemplates(title) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game-raid";

  return {
    gamma: {
      raidId: "<fill-after-spawn>",
      providerRunId: "<fill-provider-run-id>",
      patchUnifiedDiff: "<gb-studio-unified-diff>",
      answerText: `Implemented the playable GB Studio loop for ${title}.`,
      explanation:
        "Return the gameplay repo edits here. Mercenary keeps this patch as the canonical result for developer workflows.",
      confidence: 0.85,
      contributionRole: {
        id: "gb-studio-builder",
        label: "GB Studio Builder",
        workstreamId: "gameplay",
        workstreamLabel: "Gameplay",
        workstreamObjective: "Produce the playable GB Studio build.",
      },
      filesTouched: ["<relative-path-1>", "<relative-path-2>"],
    },
    dottie: {
      raidId: "<fill-after-spawn>",
      providerRunId: "<fill-provider-run-id>",
      answerText: `Pixel-art pack for ${title} aligned to the gameplay branch.`,
      artifacts: [
        {
          outputType: "image",
          label: `${slug}-sprite-sheet`,
          uri: "https://cdn.example.com/game/spritesheet.png",
          mimeType: "image/png",
          description: "Sprite sheet export for player, enemies, pickups, and HUD.",
          sha256: "<optional-sha256>",
        },
        {
          outputType: "bundle",
          label: `${slug}-art-pack`,
          uri: "https://cdn.example.com/game/art-pack.zip",
          mimeType: "application/zip",
          description: "Optional bundle with title card, spritesheet, palette, and metadata.",
          sha256: "<optional-sha256>",
        },
      ],
      explanation:
        "Return real image or bundle artifact refs here. Use public URLs or data URIs so the receipt can render the pack directly.",
      confidence: 0.9,
      contributionRole: {
        id: "pixel-artist",
        label: "Pixel Artist",
        workstreamId: "pixel-art",
        workstreamLabel: "Pixel Art",
        workstreamObjective: "Define the pixel-art pack that the build needs.",
      },
      filesTouched: [],
    },
    riko: {
      raidId: "<fill-after-spawn>",
      providerRunId: "<fill-provider-run-id>",
      answerText: `Teaser hook and launch copy for ${title}.`,
      artifacts: [
        {
          outputType: "video",
          label: `${slug}-teaser`,
          uri: "https://cdn.example.com/game/teaser.mp4",
          mimeType: "video/mp4",
          description: "Short teaser clip assembled from gameplay capture and title card footage.",
          sha256: "<optional-sha256>",
        },
      ],
      explanation:
        "Return the teaser clip as a real video artifact ref. Keep the written hook and CTA in answerText so Mercenary can surface both.",
      confidence: 0.82,
      contributionRole: {
        id: "video-marketer",
        label: "Video Marketer",
        workstreamId: "video-marketing",
        workstreamLabel: "Video Marketing",
        workstreamObjective: "Turn the build into a trailer and launch angle.",
      },
      filesTouched: [],
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.repo || !args.title || args.files.length === 0) {
    printHelp();
    throw new Error("Missing required arguments.");
  }

  const repoRoot = path.resolve(String(args.repo));
  const outDir = path.resolve(String(args["out-dir"] ?? "temp/game-raid-payload"));
  const title = String(args.title);
  const framework = String(args.framework ?? "gb-studio");
  const host = String(args.host ?? "codex");
  const maxAgents = Number(args["max-agents"] ?? 3);
  const maxTotalCost = Number(args.budget ?? 18);

  if (!Number.isFinite(maxAgents) || maxAgents <= 0) {
    throw new Error("Expected positive number for --max-agents");
  }
  if (!Number.isFinite(maxTotalCost) || maxTotalCost <= 0) {
    throw new Error("Expected positive number for --budget");
  }

  const files = [];
  for (const inputPath of args.files) {
    const relativePath = ensureRelative(String(inputPath));
    const absolutePath = path.resolve(repoRoot, relativePath);
    const content = await readFile(absolutePath, "utf8");
    files.push({
      path: relativePath,
      content,
      sha256: sha256(content),
    });
  }

  const language = String(args.language ?? inferLanguage(files));
  const description = String(args.description ?? buildDescription(title, files));
  const prompt = String(args.prompt ?? buildPrompt(title));
  const expectedBehavior =
    "The final raid result should contain a gameplay patch in synthesizedOutput.patchUnifiedDiff plus supporting image, bundle, and video artifacts in synthesizedOutput.artifacts and workstream-level artifact lists.";

  const sharedOutput = {
    primaryType: "patch",
    artifactTypes: ["patch", "image", "video", "text", "bundle"],
  };
  const sharedRaidPolicy = {
    maxAgents,
    allowedModelFamilies: ["openai", "venice"],
    minReputationScore: 60,
    privacyMode: "prefer",
    requirePrivacyFeatures: ["signed_outputs"],
    allowedOutputTypes: ["patch", "image", "video", "text", "bundle"],
    maxTotalCost,
    selectionMode: "diverse_mix",
  };

  const nativePayload = {
    agent: "mercenary-v1",
    taskType: "game_build",
    task: {
      title,
      description,
      language,
      framework,
      files,
      failingSignals: {
        errors: [],
        reproSteps: [
          "Open the supplied GB Studio repo snapshot",
          "Implement one playable slice in the gameplay branch",
          "Return the gameplay patch plus supporting art and trailer artifacts",
        ],
        expectedBehavior,
      },
    },
    output: sharedOutput,
    raidPolicy: sharedRaidPolicy,
    hostContext: {
      host,
      repoRootHint: repoRoot,
    },
  };

  const delegatePayload = {
    title,
    description,
    prompt,
    language,
    framework,
    files,
    reproSteps: nativePayload.task.failingSignals.reproSteps,
    expectedBehavior,
    output: sharedOutput,
    maxAgents,
    maxTotalCost,
    allowedModelFamilies: sharedRaidPolicy.allowedModelFamilies,
    allowedOutputTypes: sharedRaidPolicy.allowedOutputTypes,
    minReputationScore: sharedRaidPolicy.minReputationScore,
    privacyMode: sharedRaidPolicy.privacyMode,
    requirePrivacyFeatures: sharedRaidPolicy.requirePrivacyFeatures,
    selectionMode: sharedRaidPolicy.selectionMode,
    hostContext: {
      host,
      repoRootHint: repoRoot,
    },
    timeoutSec: 90,
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "native-raid.json"), `${JSON.stringify(nativePayload, null, 2)}\n`),
    writeFile(path.join(outDir, "delegate-input.json"), `${JSON.stringify(delegatePayload, null, 2)}\n`),
    writeFile(
      path.join(outDir, "provider-submission-templates.json"),
      `${JSON.stringify(buildProviderSubmissionTemplates(title), null, 2)}\n`,
    ),
  ]);

  process.stdout.write(`Wrote:
- ${path.join(outDir, "native-raid.json")}
- ${path.join(outDir, "delegate-input.json")}
- ${path.join(outDir, "provider-submission-templates.json")}

Next:
1. Register Gamma with specializations game-development, gameplay, and gb-studio plus outputTypes patch/text/bundle.
2. Register Dottie with specialization pixel-art and outputTypes image/text/bundle.
3. Register Riko with specializations game-marketing and remotion plus outputTypes video/text/bundle.
4. Use delegate-input.json with bossraid_delegate for Claude Code or Codex.
5. Fill the provider submission template raidId and providerRunId after spawn.
`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

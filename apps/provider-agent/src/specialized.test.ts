import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderTaskPackage } from "@bossraid/shared-types";

function createVideoTask(): ProviderTaskPackage {
  return {
    raidId: "raid_video_test",
    submissionFormat: "artifact_plus_explanation",
    desiredOutput: {
      primaryType: "video",
      artifactTypes: ["video", "text"],
    },
    task: {
      title: "Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.",
      description: "Create the trailer package and launch copy for the room-sized GB Studio reveal.",
      language: "text",
    },
    artifacts: {
      files: [
        {
          path: "marketing/creative-brief.md",
          content: "# Boss Raid: Slime Panic\n\nTone: Tense, retro-cute.\n",
          sha256: "creative-brief-sha",
        },
      ],
      errors: [],
      reproSteps: ["Open the project", "Package the trailer support"],
      tests: [],
      expectedBehavior: "Return a video-first trailer package for the launch.",
    },
    constraints: {
      maxChangedFiles: 0,
      maxDiffLines: 0,
      forbidPaths: [],
      mustNot: [],
    },
    synthesis: {
      mode: "multi_agent_synthesis",
      role: "contributor",
      totalExperts: 3,
      providerIndex: 3,
      workstreamId: "video-marketing",
      workstreamLabel: "Video Marketing",
      workstreamObjective: "Produce the trailer and launch package.",
      roleId: "video-marketer",
      roleLabel: "Video Marketing",
      roleObjective: "Produce the promo render artifact or final video handoff that best sells the requested game slice.",
      focus: "12-second trailer",
      guidance: ["Return one strong video deliverable."],
    },
    deadlineUnix: Math.floor(Date.now() / 1000) + 60,
  };
}

let specializedModulePromise:
  | Promise<typeof import("./specialized.js")>
  | undefined;

async function loadSpecializedModule() {
  process.env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH = "1";
  process.env.BOSSRAID_PROVIDER_MODE = "remotion";
  specializedModulePromise ??= import("./specialized.js");
  return specializedModulePromise;
}

test("submissionSupportsRequestedOutput rejects artifact sets that miss the requested media type", async () => {
  const { submissionSupportsRequestedOutput } = await loadSpecializedModule();
  const task = createVideoTask();

  assert.equal(
    submissionSupportsRequestedOutput(
      {
        explanation: "Only image previews were returned.",
        confidence: 0.6,
        filesTouched: [],
        artifacts: [
          {
            outputType: "image",
            label: "Storyboard frame",
            uri: "data:image/png;base64,AAAA",
            mimeType: "image/png",
          },
          {
            outputType: "bundle",
            label: "Trailer bundle",
            uri: "data:application/json;base64,AAAA",
            mimeType: "application/json",
          },
        ],
      },
      task,
    ),
    false,
  );
});

test("Riko remotion fallback still returns a video artifact when ffmpeg is unavailable", async () => {
  const { maybeRequestSpecializedSubmission, submissionSupportsRequestedOutput } = await loadSpecializedModule();
  const task = createVideoTask();
  const originalPath = process.env.PATH;

  process.env.PATH = "";
  try {
    const submission = await maybeRequestSpecializedSubmission(task);
    assert.ok(submission);
    assert.equal(
      submission.artifacts?.some((artifact) => artifact.outputType === "video"),
      true,
    );
    assert.equal(submissionSupportsRequestedOutput(submission, task), true);
  } finally {
    process.env.PATH = originalPath;
  }
});

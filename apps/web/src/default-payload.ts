export const DEFAULT_SPAWN_PAYLOAD = `{
  "agent": "mercenary-v1",
  "taskType": "code_debugging",
  "task": {
    "title": "Fix Unity 4D movement bug",
    "description": "Player teleports when crossing a rotated hypersurface boundary.",
    "language": "csharp",
    "framework": "unity",
    "files": [
      {
        "path": "Assets/Scripts/Player/FourDMovement.cs",
        "content": "public class FourDMovement {\\n  void Move() {\\n    return;\\n  }\\n}\\n",
        "sha256": "replace_me"
      }
    ],
    "failingSignals": {
      "errors": ["NullReferenceException at line 184"],
      "reproSteps": ["Start level 2", "Rotate on W axis", "Cross boundary"]
    }
  },
  "output": {
    "primaryType": "patch",
    "artifactTypes": ["patch", "text"]
  },
  "raidPolicy": {
    "maxAgents": 3,
    "requiredCapabilities": ["unity", "debugging", "physics"],
    "allowedModelFamilies": ["openai", "venice"],
    "minReputationScore": 70,
    "privacyMode": "prefer",
    "requirePrivacyFeatures": ["signed_outputs"],
    "allowedOutputTypes": ["patch", "text"],
    "maxTotalCost": 20,
    "selectionMode": "privacy_first"
  },
  "hostContext": {
    "host": "codex"
  }
}`;

export const DEFAULT_LIVE_DEMO_BRIEF =
  "Create a one-room GB Studio microgame called Boss Raid: Slime Panic. Mercenary should split this into gameplay, pixel art, and trailer work, keep the creative direction consistent, and return one verified receipt-backed result.";

export function buildLiveDemoPayload(brief: string) {
  const normalizedBrief = brief.trim() || DEFAULT_LIVE_DEMO_BRIEF;

  return {
    agent: "mercenary-v1",
    taskType: "game_build",
    task: {
      title: "Build a GB Studio microgame and launch package",
      description: normalizedBrief,
      language: "typescript",
      framework: "gb-studio",
      files: [
        {
          path: "game/project.gbsproj",
          content: "{\"name\":\"Boss Raid Slime Panic\",\"engine\":\"gb-studio\",\"sceneCount\":1}\n",
          sha256: "demo-gbstudio-project",
        },
        {
          path: "game/scripts/encounter.ts",
          content:
            "export const bossRaidPitch = {\n  title: \"Boss Raid: Slime Panic\",\n  loop: \"Collect the vault key, dodge slimes, and hit the exit before the timer expires.\",\n  palette: [\"#0f1c2e\", \"#ffda47\", \"#f65d5d\", \"#77f6c5\"]\n};\n",
          sha256: "demo-encounter-script",
        },
        {
          path: "marketing/creative-brief.md",
          content: `# Boss Raid: Slime Panic\n\nMission: ${normalizedBrief}\n\nDeliverables: playable patch, sprite pack, 12-second teaser, and launch copy.\n`,
          sha256: "demo-creative-brief",
        },
      ],
      failingSignals: {
        errors: [],
        reproSteps: [
          "Open the supplied GB Studio repo snapshot",
          "Implement one playable room with key, slime, and exit loop",
          "Return the gameplay patch plus supporting art and trailer artifacts",
        ],
        expectedBehavior:
          "The final raid result should include a playable GB Studio patch, image artifacts for the art pack, a teaser clip, and synthesized launch copy.",
      },
    },
    output: {
      primaryType: "patch",
      artifactTypes: ["patch", "image", "video", "text", "bundle"],
    },
    raidPolicy: {
      maxAgents: 3,
      allowedModelFamilies: ["openai", "venice"],
      minReputationScore: 60,
      privacyMode: "prefer",
      requirePrivacyFeatures: ["signed_outputs"],
      allowedOutputTypes: ["patch", "image", "video", "text", "bundle"],
      maxTotalCost: 18,
      selectionMode: "diverse_mix",
    },
  };
}

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

const NATIVE_CHAT_SYSTEM_PROMPT =
  "You are Mercenary in the native Boss Raid demo. Reply directly and concisely. If the user is greeting you or asking what you can do, answer conversationally and do not pretend a build already happened. Only treat the request as a real seeded GB Studio build when the user explicitly asks for that game package.";

const SEEDED_GAME_BUILD_SIGNALS = [
  /\bgb studio\b/,
  /\bmicrogame\b/,
  /\bpixel art\b/,
  /\bsprite(?:s|sheet)?\b/,
  /\btrailer\b/,
  /\bteaser\b/,
  /\bone-room\b/,
  /\bslime\b/,
  /\bdungeon\b/,
  /\blaunch package\b/,
  /\barcade challenge\b/,
  /\bkey\b/,
  /\bboss\b/,
];

const EXPLICIT_WORK_SIGNALS = [
  /^(build|create|make|ship|design|generate|draft|produce|implement)\b/,
  /\b(can you|could you|please|help me|i want you to|i need you to)\s+(build|create|make|ship|design|generate|draft|produce|implement)\b/,
  /\bmake me\b/,
  /\bcreate me\b/,
];

function buildLiveDemoFiles(normalizedBrief: string) {
  return [
    {
      path: "game/project.gbsproj",
      content: `{
  "name": "Boss Raid: Slime Panic",
  "engine": "gb-studio",
  "sceneCount": 1,
  "scenes": [
    {
      "name": "Dungeon Vault",
      "background": "dungeon-vault",
      "actors": ["player", "slime-king", "vault-key", "exit-door"]
    }
  ],
  "notes": "One-room microgame scaffold for Mercenary live demo."
}
`,
      sha256: "demo-gbstudio-project",
    },
    {
      path: "game/scripts/encounter.ts",
      content: `export const bossRaidPitch = {
  title: "Boss Raid: Slime Panic",
  loop: "Collect the vault key, dodge the slime king, and reach the exit before the timer expires.",
  sceneName: "Dungeon Vault",
  npcName: "Slime King",
  npcLine: "No one leaves the vault without the key.",
  palette: ["#0f1c2e", "#ffda47", "#f65d5d", "#77f6c5"],
  goals: [
    "Build one readable room with a key lane, chase pressure, and an exit check.",
    "Make the room fully playable inside a 30-second run.",
    "Keep the art, gameplay, and trailer aligned to the same hook."
  ],
  assetPlan: [
    "player walk sheet",
    "slime king bounce sheet",
    "vault key pickup sprite",
    "exit door open/closed sprite",
    "dungeon floor + wall tiles",
    "timer and key HUD icons"
  ]
};
`,
      sha256: "demo-encounter-script",
    },
    {
      path: "game/scripts/timer.ts",
      content: `export const slimePanicTimer = {
  totalSeconds: 30,
  warningSeconds: 10,
  loseState: "timer-expired"
};

export function stepEncounterTimer(secondsRemaining: number, deltaSeconds: number): number {
  return Math.max(0, Number((secondsRemaining - deltaSeconds).toFixed(2)));
}
`,
      sha256: "demo-timer-script",
    },
    {
      path: "game/scripts/slime-king.ts",
      content: `export type GridPoint = { x: number; y: number };

export type SlimeKingState = {
  patrolRoute: GridPoint[];
  routeIndex: number;
  detectionRadius: number;
};

export const defaultSlimeKingState: SlimeKingState = {
  patrolRoute: [
    { x: 9, y: 6 },
    { x: 12, y: 6 },
    { x: 12, y: 10 },
    { x: 9, y: 10 }
  ],
  routeIndex: 0,
  detectionRadius: 4
};

export function chooseSlimeKingTarget(state: SlimeKingState, player: GridPoint, hasKey: boolean): GridPoint {
  if (hasKey) {
    return player;
  }

  return state.patrolRoute[state.routeIndex] ?? player;
}
`,
      sha256: "demo-slime-king-script",
    },
    {
      path: "game/scripts/exit-door.ts",
      content: `export type ExitGateState = {
  locked: boolean;
  prompt: string;
};

export function resolveExitGateState(hasKey: boolean, timerExpired: boolean): ExitGateState {
  if (timerExpired) {
    return { locked: true, prompt: "Too late. Restart the room." };
  }

  if (!hasKey) {
    return { locked: true, prompt: "Find the vault key first." };
  }

  return { locked: false, prompt: "Exit unlocked. Move." };
}
`,
      sha256: "demo-exit-door-script",
    },
    {
      path: "game/data/dungeon-vault.scene.json",
      content: `{
  "name": "Dungeon Vault",
  "size": { "width": 20, "height": 18 },
  "playerSpawn": { "x": 2, "y": 9 },
  "bossSpawn": { "x": 10, "y": 8 },
  "keySpawn": { "x": 3, "y": 3 },
  "exitDoor": { "x": 17, "y": 14 },
  "tilemap": [
    "####################",
    "#........##........#",
    "#.###....##....###.#",
    "#..K.....##........#",
    "#........##..###...#",
    "#..####......###...#",
    "#........SS........#",
    "#........SS........#",
    "#..###........###..#",
    "#..###........###..#",
    "#........##........#",
    "#...###..##..###...#",
    "#........##........#",
    "#........##.....D..#",
    "#..####........###.#",
    "#........##........#",
    "#........##........#",
    "####################"
  ]
}
`,
      sha256: "demo-scene-json",
    },
    {
      path: "game/data/ui-hud.json",
      content: `{
  "timer": {
    "anchor": "top-left",
    "format": "00:30",
    "warningThreshold": 10
  },
  "keyIcon": {
    "anchor": "top-right",
    "emptyState": "outline",
    "filledState": "filled"
  },
  "statusText": "Get the key. Reach the exit."
}
`,
      sha256: "demo-ui-hud-json",
    },
    {
      path: "marketing/creative-brief.md",
      content: `# Boss Raid: Slime Panic

Tone: Tense, retro-cute, readable in one glance.
Audience: players who like tiny retro challenge games.
Mission: ${normalizedBrief}
Deliverables: gameplay patch, pixel pack, teaser clip, and launch copy.

## Shared Hook
Collect key -> dodge boss slime -> reach exit before timer runs out

## Room Plan
- One 20x18 dungeon room with a readable patrol lane
- Key spawn at top-left pressure point
- Slime King patrols center, then chases once the key is taken
- Exit door opens only after the key pickup
- Timer and key status visible in the HUD

## Asset Plan
- Player walk sheet
- Slime King bounce sheet
- Vault key pickup sprite
- Exit door open and closed sprite
- Dungeon floor and wall tiles
- Timer and key HUD icons
`,
      sha256: "demo-creative-brief",
    },
  ];
}

function buildSeededGameDemoPayload(normalizedBrief: string) {
  return {
    agent: "mercenary-v1",
    taskType: "game_build",
    task: {
      title: "Build a GB Studio microgame and launch package",
      description: normalizedBrief,
      language: "typescript",
      framework: "gb-studio",
      files: buildLiveDemoFiles(normalizedBrief),
      failingSignals: {
        errors: [],
        reproSteps: [
          "Open the supplied GB Studio repo snapshot",
          "Implement the Dungeon Vault room, timer loop, boss pressure, and exit unlock flow",
          "Return gameplay changes plus supporting art and trailer artifacts",
        ],
        expectedBehavior:
          "The final raid result should include a concrete room layout, timer and boss behavior logic, supporting pixel assets, a teaser preview, and synthesized launch copy.",
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

function buildNativeChatDemoPayload(normalizedBrief: string) {
  const title = normalizedBrief.slice(0, 80) || "Mercenary native chat";

  return {
    agent: "mercenary-v1",
    taskType: "analysis",
    task: {
      title,
      description: `System:\n${NATIVE_CHAT_SYSTEM_PROMPT}\n\nUser:\n${normalizedBrief}`,
      language: "text",
      files: [],
      failingSignals: {
        errors: [],
        reproSteps: [
          "Read the user message",
          "Reply directly as Mercenary",
          "If the user is only chatting, keep the response conversational instead of fabricating a shipped deliverable",
        ],
        expectedBehavior:
          "Return one clean Mercenary answer. Do not claim a build or artifact package exists unless the user explicitly asked for the seeded GB Studio demo build.",
      },
    },
    output: {
      primaryType: "text",
      artifactTypes: ["text", "json"],
    },
    raidPolicy: {
      maxAgents: 3,
      maxLatencySec: 45,
      allowedModelFamilies: ["openai", "venice"],
      minReputationScore: 60,
      privacyMode: "prefer",
      requirePrivacyFeatures: ["signed_outputs"],
      allowedOutputTypes: ["text", "json"],
      maxTotalCost: 12,
      selectionMode: "best_match",
    },
    hostContext: {
      host: "web_demo",
    },
  };
}

function isSeededGameBuildRequest(brief: string): boolean {
  const normalizedBrief = brief.trim().toLowerCase();
  if (normalizedBrief.length === 0) {
    return false;
  }

  const hasWorkSignal = EXPLICIT_WORK_SIGNALS.some((pattern) => pattern.test(normalizedBrief));
  const hasSeededGameSignal = SEEDED_GAME_BUILD_SIGNALS.some((pattern) => pattern.test(normalizedBrief));
  return hasWorkSignal && hasSeededGameSignal;
}

export function buildLiveDemoPayload(brief: string) {
  const normalizedBrief = brief.trim() || DEFAULT_LIVE_DEMO_BRIEF;
  return isSeededGameBuildRequest(normalizedBrief)
    ? buildSeededGameDemoPayload(normalizedBrief)
    : buildNativeChatDemoPayload(normalizedBrief);
}

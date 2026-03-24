import { spawnSync } from "node:child_process";
import type { ProviderTaskPackage, SubmissionArtifact, TaskFile } from "@bossraid/shared-types";
import { providerConfig } from "./config.js";
import { ArtifactBuilder, createBundleArtifact, createFileArtifact, joinArtifactPath } from "./artifacts.js";
import { Bitmap, encodeGifAnimation, encodePng, parseHexColor, type RgbaColor } from "./bitmap.js";
import { generateStructuredWithVenice } from "./venice.js";
import type { ModelSubmission } from "./types.js";

type ProviderMode = "generic" | "gbstudio" | "pixel_art" | "remotion";

type GbStudioPlan = {
  title: string;
  genre: string;
  tone: string;
  coreMechanic: string;
  sceneName: string;
  npcName: string;
  npcLine: string;
  palette: string[];
  conceptSummary: string;
  milestonePlan: string[];
  roomPlan: string[];
  assetPlan: string[];
  patchSummary: string;
  gameplayChanges: string[];
};

type PixelPlan = {
  artDirection: string;
  palette: string[];
  assetList: string[];
  notes: string[];
  summary: string;
};

type VideoPlan = {
  projectTitle: string;
  format: string;
  durationSec: number;
  visualStyle: string;
  musicMood: string;
  scriptSummary: string;
  beatSheet: string[];
  compositionPlan: string[];
  renderNotes: string[];
  palette: string[];
  launchCopy: string[];
};

type TextPlan = {
  answerText: string;
  explanation: string;
  confidence: number;
};

function normalizeName(value: string, fallback: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || fallback;
}

function toHex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

function buildPalette(colors: string[]): RgbaColor[] {
  return colors.map((color) => parseHexColor(color));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function extractPalette(task: ProviderTaskPackage, fallback: string[]): string[] {
  const matches = `${task.task.description}\n${task.artifacts.files.map((file) => file.content).join("\n")}`.match(
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g,
  );
  const palette = unique((matches ?? []).map((value) => value.toUpperCase()));
  return palette.length >= 4 ? palette.slice(0, 4) : fallback;
}

function extractGameTitle(task: ProviderTaskPackage): string {
  return task.task.title.trim() || "Boss Raid Microgame";
}

function shortText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function firstFile(task: ProviderTaskPackage, predicate: (file: TaskFile) => boolean): TaskFile | undefined {
  return task.artifacts.files.find(predicate);
}

function quotedList(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

function buildUnifiedDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const beforeCount = beforeLines.length;
  const afterCount = afterLines.length;
  const beforeBody = beforeLines.map((line) => `-${line}`).join("\n");
  const afterBody = afterLines.map((line) => `+${line}`).join("\n");
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${beforeCount} +1,${afterCount} @@`, beforeBody, afterBody].join("\n");
}

type SpriteKind =
  | "hero"
  | "npc"
  | "key"
  | "slime"
  | "tree"
  | "ui"
  | "door"
  | "floor_tile"
  | "wall_tile";

type DungeonBlueprint = {
  name: string;
  width: number;
  height: number;
  playerSpawn: { x: number; y: number };
  bossSpawn: { x: number; y: number };
  keySpawn: { x: number; y: number };
  exitDoor: { x: number; y: number };
  patrolRoute: Array<{ x: number; y: number }>;
  tilemap: string[];
};

function createSimpleSprite(
  width: number,
  height: number,
  colors: RgbaColor[],
  kind: SpriteKind,
  variant: number,
): Bitmap {
  const bitmap = new Bitmap(width, height, { r: 0, g: 0, b: 0, a: 0 });
  const floorBase = colors[0] ?? parseHexColor("0F1C2E");
  const wallBase = colors[1] ?? parseHexColor("FFDA47");
  const accent = colors[2] ?? parseHexColor("F65D5D");
  const outline = colors[3] ?? parseHexColor("77F6C5");
  const light = parseHexColor("F4F1D8");

  if (kind === "hero" || kind === "npc") {
    const armOffset = variant % 2;
    bitmap.fillRect(5, 1, 6, 4, light);
    bitmap.fillRect(4, 5, 8, 5, accent);
    bitmap.fillRect(5, 10, 2, 4, outline);
    bitmap.fillRect(9, 10, 2, 4, outline);
    bitmap.fillRect(2 + armOffset, 6, 2, 5, wallBase);
    bitmap.fillRect(12 - armOffset, 6, 2, 5, wallBase);
    bitmap.setPixel(6, 3, outline);
    bitmap.setPixel(9, 3, outline);
    bitmap.fillRect(6, 4, 3, 1, outline);
    bitmap.strokeRect(4, 5, 8, 5, outline);
    bitmap.strokeRect(5, 1, 6, 4, outline);
  } else if (kind === "key") {
    const sparkleOffset = variant % 2;
    bitmap.fillRect(3, 6, 7, 3, wallBase);
    bitmap.fillRect(10, 5, 2, 5, wallBase);
    bitmap.fillRect(11, 3, 3, 2, wallBase);
    bitmap.fillRect(11, 9, 2, 2, wallBase);
    bitmap.fillRect(8, 8, 2, 3, accent);
    bitmap.fillRect(3 + sparkleOffset, 2, 1, 3, outline);
    bitmap.fillRect(2 + sparkleOffset, 3, 3, 1, outline);
    bitmap.strokeRect(2, 5, 10, 5, outline);
  } else if (kind === "slime") {
    const bounce = variant % 2;
    bitmap.fillRect(3, 5 - bounce, 10, 6, accent);
    bitmap.fillRect(4, 11 - bounce, 8, 2, accent);
    bitmap.fillRect(5, 6 - bounce, 2, 2, light);
    bitmap.fillRect(9, 6 - bounce, 2, 2, light);
    bitmap.fillRect(6, 8 - bounce, 1, 1, outline);
    bitmap.fillRect(10, 8 - bounce, 1, 1, outline);
    bitmap.fillRect(6, 10 - bounce, 4, 1, outline);
    bitmap.fillRect(4, 12 - bounce, 2, 1, outline);
    bitmap.fillRect(10, 12 - bounce, 2, 1, outline);
  } else if (kind === "door") {
    const isOpen = variant % 2 === 1;
    bitmap.fillRect(3, 1, 10, 14, wallBase);
    bitmap.fillRect(5, 3, 6, 10, floorBase);
    bitmap.fillRect(8 + (isOpen ? 3 : 0), 8, 1, 1, accent);
    bitmap.strokeRect(3, 1, 10, 14, outline);
    if (height > 16) {
      bitmap.fillRect(5, 16, 6, height - 16, wallBase);
      bitmap.strokeRect(3, 15, 10, height - 15, outline);
    }
  } else if (kind === "floor_tile") {
    bitmap.fillRect(0, 0, width, height, floorBase);
    for (let y = 2; y < height; y += 4) {
      for (let x = (y / 2) % 4 === 0 ? 1 : 3; x < width; x += 4) {
        bitmap.fillRect(x, y, 2, 1, outline);
      }
    }
    bitmap.strokeRect(0, 0, width, height, outline);
  } else if (kind === "wall_tile") {
    bitmap.fillRect(0, 0, width, height, wallBase);
    for (let y = 2; y < height; y += 4) {
      bitmap.fillRect(2, y, width - 4, 1, accent);
    }
    bitmap.strokeRect(0, 0, width, height, outline);
  } else if (kind === "tree") {
    bitmap.fillRect(6, 10, 4, 5, outline);
    bitmap.fillRect(3, 3, 10, 8, accent);
    bitmap.fillRect(5, 5, 6, 4, wallBase);
  } else if (kind === "ui") {
    bitmap.fillRect(1, 1, width - 2, height - 2, floorBase);
    bitmap.strokeRect(1, 1, width - 2, height - 2, outline);
    bitmap.fillRect(3, 3, width - 6, 3, wallBase);
    bitmap.fillRect(3, 8, width - 6, 2, accent);
  } else {
    bitmap.fillRect(4, 3, 8, 10, accent);
    bitmap.fillRect(5, 4, 6, 8, wallBase);
    bitmap.strokeRect(4, 3, 8, 10, outline);
  }

  return bitmap;
}

function createSpriteSheet(
  frameWidth: number,
  frameHeight: number,
  colors: RgbaColor[],
  kind: SpriteKind,
  frameCount: number,
): Bitmap {
  const sheet = new Bitmap(frameWidth * frameCount, frameHeight, { r: 0, g: 0, b: 0, a: 0 });
  for (let frame = 0; frame < frameCount; frame += 1) {
    sheet.blit(createSimpleSprite(frameWidth, frameHeight, colors, kind, frame), frame * frameWidth, 0);
  }
  return sheet;
}

function inferAssetKind(name: string): SpriteKind {
  const lower = name.toLowerCase();
  if (lower.includes("floor")) {
    return "floor_tile";
  }
  if (lower.includes("wall")) {
    return "wall_tile";
  }
  if (lower.includes("coin") || lower.includes("gem") || lower.includes("pickup") || lower.includes("key")) {
    return "key";
  }
  if (lower.includes("tree") || lower.includes("plant") || lower.includes("bush")) {
    return "tree";
  }
  if (lower.includes("door") || lower.includes("exit")) {
    return "door";
  }
  if (lower.includes("ui") || lower.includes("button") || lower.includes("panel") || lower.includes("title")) {
    return "ui";
  }
  if (lower.includes("monster") || lower.includes("enemy") || lower.includes("slime")) {
    return "slime";
  }
  if (lower.includes("npc") || lower.includes("guide")) {
    return "npc";
  }
  return "hero";
}

function buildDungeonBlueprint(plan: GbStudioPlan): DungeonBlueprint {
  return {
    name: plan.sceneName,
    width: 20,
    height: 18,
    playerSpawn: { x: 2, y: 9 },
    bossSpawn: { x: 10, y: 8 },
    keySpawn: { x: 3, y: 3 },
    exitDoor: { x: 17, y: 13 },
    patrolRoute: [
      { x: 9, y: 6 },
      { x: 12, y: 6 },
      { x: 12, y: 10 },
      { x: 9, y: 10 },
    ],
    tilemap: [
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
      "####################",
    ],
  };
}

function drawDungeonRoomPreview(blueprint: DungeonBlueprint, colors: RgbaColor[]): Bitmap {
  const tileSize = 8;
  const bitmap = new Bitmap(blueprint.width * tileSize, blueprint.height * tileSize, colors[0]);
  const floor = colors[0] ?? parseHexColor("0F1C2E");
  const wall = colors[1] ?? parseHexColor("FFDA47");
  const danger = colors[2] ?? parseHexColor("F65D5D");
  const accent = colors[3] ?? parseHexColor("77F6C5");

  blueprint.tilemap.forEach((row, rowIndex) => {
    [...row].forEach((cell, columnIndex) => {
      const x = columnIndex * tileSize;
      const y = rowIndex * tileSize;
      bitmap.fillRect(x, y, tileSize, tileSize, floor);

      if (cell === "#") {
        bitmap.fillRect(x, y, tileSize, tileSize, wall);
        bitmap.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2, floor);
        bitmap.fillRect(x + 2, y + 2, tileSize - 4, 1, accent);
        return;
      }

      if ((columnIndex + rowIndex) % 2 === 0) {
        bitmap.fillRect(x + 1, y + 1, 2, 2, accent);
        bitmap.fillRect(x + 5, y + 5, 1, 1, accent);
      }

      if (cell === "K") {
        bitmap.blit(createSimpleSprite(8, 8, colors, "key", 0), x, y);
      } else if (cell === "D") {
        bitmap.blit(createSimpleSprite(8, 8, colors, "door", 0), x, y);
      } else if (cell === "S") {
        bitmap.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2, danger);
      }
    });
  });

  bitmap.fillRect(blueprint.playerSpawn.x * tileSize + 2, blueprint.playerSpawn.y * tileSize + 2, 4, 4, accent);
  bitmap.drawText("30", 8, 8, wall, { scale: 1 });
  bitmap.drawText("KEY", 116, 8, wall, { scale: 1 });
  return bitmap;
}

function buildGbStudioProjectDocument(plan: GbStudioPlan, blueprint: DungeonBlueprint, sceneSlug: string) {
  return {
    _resourceType: "project",
    name: plan.title,
    author: "Boss Raid / Gamma",
    notes: plan.conceptSummary,
    engine: "gb-studio",
    scenes: [
      {
        id: `${sceneSlug}-scene`,
        name: blueprint.name,
        background: `${sceneSlug}.png`,
        playerSpawn: blueprint.playerSpawn,
        bossSpawn: blueprint.bossSpawn,
      },
    ],
    spriteSheets: [
      { id: `${sceneSlug}-player`, name: "player", filename: "player.png", frames: 4 },
      { id: `${sceneSlug}-slime`, name: "slime-king", filename: "slime-king.png", frames: 2 },
      { id: `${sceneSlug}-key`, name: "vault-key", filename: "vault-key.png", frames: 2 },
      { id: `${sceneSlug}-door`, name: "exit-door", filename: "exit-door.png", frames: 2 },
    ],
    backgrounds: [{ id: `${sceneSlug}-background`, name: blueprint.name, filename: `${sceneSlug}.png` }],
    palettes: [
      { id: "default-bg-1", name: "Default BG 1", colors: plan.palette.map(toHex) },
      { id: "default-sprite", name: "Default Sprites", colors: plan.palette.map(toHex) },
    ],
  };
}

function buildEncounterModule(plan: GbStudioPlan, blueprint: DungeonBlueprint): string {
  return [
    "export const bossRaidPitch = {",
    `  title: ${JSON.stringify(plan.title)},`,
    `  loop: ${JSON.stringify(plan.coreMechanic)},`,
    `  sceneName: ${JSON.stringify(plan.sceneName)},`,
    `  npcName: ${JSON.stringify(plan.npcName)},`,
    `  npcLine: ${JSON.stringify(plan.npcLine)},`,
    `  palette: ${JSON.stringify(plan.palette)},`,
    `  goals: ${JSON.stringify(plan.roomPlan)},`,
    `  assetPlan: ${JSON.stringify(plan.assetPlan)},`,
    `  playerSpawn: ${JSON.stringify(blueprint.playerSpawn)},`,
    `  bossSpawn: ${JSON.stringify(blueprint.bossSpawn)},`,
    `  keySpawn: ${JSON.stringify(blueprint.keySpawn)},`,
    `  exitDoor: ${JSON.stringify(blueprint.exitDoor)}`,
    "};",
    "",
  ].join("\n");
}

function buildTimerModule(): string {
  return [
    "export const slimePanicTimer = {",
    "  totalSeconds: 30,",
    "  warningSeconds: 10,",
    "  loseState: \"timer-expired\"",
    "};",
    "",
    "export function stepEncounterTimer(secondsRemaining: number, deltaSeconds: number): number {",
    "  return Math.max(0, Number((secondsRemaining - deltaSeconds).toFixed(2)));",
    "}",
    "",
    "export function shouldTriggerWarning(secondsRemaining: number): boolean {",
    "  return secondsRemaining <= slimePanicTimer.warningSeconds;",
    "}",
    "",
  ].join("\n");
}

function buildSlimeKingModule(plan: GbStudioPlan, blueprint: DungeonBlueprint): string {
  return [
    "export type GridPoint = { x: number; y: number };",
    "",
    "export type SlimeKingState = {",
    "  patrolRoute: GridPoint[];",
    "  routeIndex: number;",
    "  detectionRadius: number;",
    "  speed: number;",
    "};",
    "",
    "export const defaultSlimeKingState: SlimeKingState = {",
    `  patrolRoute: ${JSON.stringify(blueprint.patrolRoute)},`,
    "  routeIndex: 0,",
    "  detectionRadius: 5,",
    "  speed: 1",
    "};",
    "",
    "export function chooseSlimeKingTarget(state: SlimeKingState, player: GridPoint, hasKey: boolean): GridPoint {",
    "  if (hasKey) {",
    "    return player;",
    "  }",
    "",
    "  return state.patrolRoute[state.routeIndex] ?? player;",
    "}",
    "",
    "export function buildSlimeKingTaunt(): string {",
    `  return ${JSON.stringify(plan.npcLine)};`,
    "}",
    "",
  ].join("\n");
}

function buildExitDoorModule(blueprint: DungeonBlueprint): string {
  return [
    "export type ExitGateState = {",
    "  locked: boolean;",
    "  prompt: string;",
    "  location: { x: number; y: number };",
    "};",
    "",
    "export function resolveExitGateState(hasKey: boolean, timerExpired: boolean): ExitGateState {",
    "  if (timerExpired) {",
    `    return { locked: true, prompt: "Too late. Restart the room.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    "  }",
    "",
    "  if (!hasKey) {",
    `    return { locked: true, prompt: "Find the vault key first.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    "  }",
    "",
    `  return { locked: false, prompt: "Exit unlocked. Move.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    "}",
    "",
  ].join("\n");
}

function buildSceneDocument(plan: GbStudioPlan, blueprint: DungeonBlueprint) {
  return {
    name: blueprint.name,
    objective: plan.coreMechanic,
    size: { width: blueprint.width, height: blueprint.height },
    playerSpawn: blueprint.playerSpawn,
    bossSpawn: blueprint.bossSpawn,
    keySpawn: blueprint.keySpawn,
    exitDoor: blueprint.exitDoor,
    patrolRoute: blueprint.patrolRoute,
    tilemap: blueprint.tilemap,
  };
}

function buildHudDocument(blueprint: DungeonBlueprint) {
  return {
    timer: {
      anchor: "top-left",
      format: "00:30",
      warningThreshold: 10,
    },
    keyIcon: {
      anchor: "top-right",
      emptyState: "outline",
      filledState: "filled",
    },
    prompts: {
      start: "Get the key. Reach the exit.",
      fail: "The vault resets.",
      exit: `Door at ${blueprint.exitDoor.x},${blueprint.exitDoor.y}`,
    },
  };
}

function buildCreativeBrief(plan: GbStudioPlan): string {
  return [
    `# ${plan.title}`,
    "",
    `Tone: ${plan.tone}.`,
    "Audience: players who like tiny retro challenge games.",
    "Deliverables: gameplay patch, pixel pack, teaser clip, and launch copy.",
    "",
    "## Shared Hook",
    plan.coreMechanic,
    "",
    "## Room Plan",
    quotedList(plan.roomPlan),
    "",
    "## Asset Plan",
    quotedList(plan.assetPlan),
    "",
  ].join("\n");
}

function buildGameplayReadme(plan: GbStudioPlan): string {
  return [
    `# ${plan.title}`,
    "",
    plan.conceptSummary,
    "",
    "## Core Mechanic",
    plan.coreMechanic,
    "",
    "## Milestones",
    ...plan.milestonePlan.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Gameplay Changes",
    ...plan.gameplayChanges.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderStoryFrame(
  width: number,
  height: number,
  palette: string[],
  headline: string,
  subhead: string,
  accent: string,
  frameIndex: number,
): Bitmap {
  const colors = buildPalette(palette);
  const bitmap = new Bitmap(width, height, colors[0]);
  bitmap.fillRect(0, 0, width, 20, colors[3]);
  bitmap.fillRect(0, height - 28, width, 28, colors[2]);
  bitmap.fillRect(18, 32, width - 36, height - 86, colors[1]);
  bitmap.strokeRect(18, 32, width - 36, height - 86, colors[3]);
  bitmap.fillRect(32 + frameIndex * 6, 52, 54, 54, colors[2]);
  bitmap.fillRect(width - 110, 54, 62, 42, colors[3]);
  bitmap.fillRect(width - 102, 62, 46, 6, colors[0]);
  bitmap.fillRect(width - 102, 74, 38, 6, colors[0]);
  bitmap.fillRect(width - 102, 86, 52, 6, colors[0]);
  bitmap.drawText(headline, 16, 5, colors[0], { scale: 2, maxWidth: width - 32, lineHeight: 18 });
  bitmap.drawText(subhead, 16, height - 24, colors[0], { scale: 1, maxWidth: width - 32, lineHeight: 10 });
  bitmap.drawText(accent, 30, 116, colors[3], { scale: 1, maxWidth: width - 60 });
  return bitmap;
}

function tryRunFfmpeg(args: string[]): boolean {
  // Keep the optional mp4 preview from blocking provider heartbeats on slow hosts.
  const result = spawnSync("ffmpeg", args, {
    stdio: "ignore",
    timeout: 1_500,
    killSignal: "SIGKILL",
  });
  return result.status === 0;
}

function readVeniceRuntime() {
  if (!providerConfig.modelApiKey || !providerConfig.modelName || !providerConfig.modelApiBase.includes("venice")) {
    return undefined;
  }

  return {
    apiBase: providerConfig.modelApiBase,
    apiKey: providerConfig.modelApiKey,
    model: providerConfig.modelName,
    reasoningEffort: providerConfig.modelReasoningEffort,
  };
}

async function planWithVenice<T>(
  schema: Record<string, unknown>,
  systemPrompt: string,
  userPrompt: string,
): Promise<T | undefined> {
  const runtime = readVeniceRuntime();
  if (!runtime) {
    return undefined;
  }

  return generateStructuredWithVenice<T>(runtime, {
    systemPrompt,
    userPrompt,
    schema,
    maxCompletionTokens: 900,
    temperature: 0.4,
  });
}

function fallbackGbStudioPlan(task: ProviderTaskPackage): GbStudioPlan {
  const title = extractGameTitle(task);
  const hook = shortText(task.task.description.split(".")[0] ?? "", "Escape the room before the timer expires.");
  return {
    title,
    genre: "retro action-puzzle",
    tone: "playful pressure",
    coreMechanic: hook,
    sceneName: "Dungeon Vault",
    npcName: "Slime King",
    npcLine: "No one leaves the vault without the key.",
    palette: extractPalette(task, ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"]),
    conceptSummary: `${title} is a one-room microgame about reading slime paths, taking the key, and escaping under pressure.`,
    milestonePlan: [
      "Lock the Dungeon Vault room layout with one readable patrol lane.",
      "Wire timer pressure, key pickup, and exit unlock into one complete run.",
      "Align the art pack and teaser to the same one-room escape story.",
    ],
    roomPlan: [
      "Place the player on the left lane, the key at the upper pressure point, and the exit at the lower-right vault door.",
      "Keep the Slime King in the center patrol box until the key is collected, then switch to chase pressure.",
      "Show the timer and key state in the HUD so the win condition reads in one glance.",
    ],
    assetPlan: ["player walk sheet", "slime king bounce sheet", "vault key pickup sprite", "exit door open and closed sprite", "dungeon floor tile", "dungeon wall tile", "timer and key HUD icons"],
    patchSummary: "Replace the thin demo scaffold with a concrete Dungeon Vault room package, gameplay scripts, and supporting GB Studio data files.",
    gameplayChanges: [
      "Update the project manifest with concrete scene, background, and sprite sheet entries.",
      "Implement timer, Slime King target selection, exit gating, and room blueprint data.",
      "Align the creative brief to the same concrete room layout and asset list.",
    ],
  };
}

async function buildGbStudioPlan(task: ProviderTaskPackage): Promise<GbStudioPlan> {
  const fallback = fallbackGbStudioPlan(task);
  const planned = await planWithVenice<GbStudioPlan>(
    {
      name: "gamma_gbstudio_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "genre",
          "tone",
          "coreMechanic",
          "sceneName",
          "npcName",
          "npcLine",
          "palette",
          "conceptSummary",
          "milestonePlan",
          "roomPlan",
          "assetPlan",
          "patchSummary",
          "gameplayChanges",
        ],
        properties: {
          title: { type: "string" },
          genre: { type: "string" },
          tone: { type: "string" },
          coreMechanic: { type: "string" },
          sceneName: { type: "string" },
          npcName: { type: "string" },
          npcLine: { type: "string" },
          palette: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          conceptSummary: { type: "string" },
          milestonePlan: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          roomPlan: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          assetPlan: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
          patchSummary: { type: "string" },
          gameplayChanges: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
        },
      },
    },
    "You are Gamma, a game developer inside Boss Raid. Plan one small playable game slice. Keep the plan concrete and consistent with the supplied repo context.",
    JSON.stringify(
      {
        task: task.task,
        synthesis: task.synthesis,
        files: task.artifacts.files.map((file) => ({ path: file.path, content: file.content })),
      },
      null,
      2,
    ),
  ).catch(() => undefined);
  return planned ?? fallback;
}

function produceGbStudioBundle(plan: GbStudioPlan) {
  const builder = new ArtifactBuilder("gamma");
  const palette = plan.palette.length >= 4 ? plan.palette : ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"];
  const colors = buildPalette(palette);
  const sceneSlug = normalizeName(plan.sceneName, "scene-one");
  const blueprint = buildDungeonBlueprint(plan);
  const background = drawDungeonRoomPreview(blueprint, colors);
  const playerSheet = createSpriteSheet(16, 16, colors, "hero", 4);
  const slimeSheet = createSpriteSheet(16, 16, colors, "slime", 2);
  const keySheet = createSpriteSheet(16, 16, colors, "key", 2);
  const doorSheet = createSpriteSheet(16, 32, colors, "door", 2);
  const floorTile = createSimpleSprite(16, 16, colors, "floor_tile", 0);
  const wallTile = createSimpleSprite(16, 16, colors, "wall_tile", 0);
  const hudIcons = createSpriteSheet(16, 16, colors, "ui", 2);

  builder.writeBinary(joinArtifactPath("game", "assets", "backgrounds", `${sceneSlug}.png`), encodePng(background), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "sprites", "player.png"), encodePng(playerSheet), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "sprites", "slime-king.png"), encodePng(slimeSheet), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "sprites", "vault-key.png"), encodePng(keySheet), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "sprites", "exit-door.png"), encodePng(doorSheet), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "tiles", "floor-tile.png"), encodePng(floorTile), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "tiles", "wall-tile.png"), encodePng(wallTile), "image/png");
  builder.writeBinary(joinArtifactPath("game", "assets", "ui", "hud-icons.png"), encodePng(hudIcons), "image/png");
  builder.writeJson(joinArtifactPath("game", "project.gbsproj"), buildGbStudioProjectDocument(plan, blueprint, sceneSlug));
  builder.writeText(joinArtifactPath("game", "scripts", "encounter.ts"), buildEncounterModule(plan, blueprint));
  builder.writeText(joinArtifactPath("game", "scripts", "timer.ts"), buildTimerModule());
  builder.writeText(joinArtifactPath("game", "scripts", "slime-king.ts"), buildSlimeKingModule(plan, blueprint));
  builder.writeText(joinArtifactPath("game", "scripts", "exit-door.ts"), buildExitDoorModule(blueprint));
  builder.writeJson(joinArtifactPath("game", "data", "dungeon-vault.scene.json"), buildSceneDocument(plan, blueprint));
  builder.writeJson(joinArtifactPath("game", "data", "ui-hud.json"), buildHudDocument(blueprint));
  builder.writeJson(joinArtifactPath("game", "design", "notes.json"), {
    title: plan.title,
    genre: plan.genre,
    tone: plan.tone,
    coreMechanic: plan.coreMechanic,
    sceneName: plan.sceneName,
    npcName: plan.npcName,
    npcLine: plan.npcLine,
    roomPlan: plan.roomPlan,
    assetPlan: plan.assetPlan,
    gameplayChanges: plan.gameplayChanges,
  });
  builder.writeText(joinArtifactPath("game", "README.md"), buildGameplayReadme(plan));
  builder.writeText(
    joinArtifactPath("marketing", "launch-copy.md"),
    `# Launch Copy\n\n${plan.title}\n\n${plan.coreMechanic}\n\n- Dodge the ${plan.npcName.toLowerCase()}.\n- Grab the key.\n- Reach the door before the clock wins.\n`,
  );

  return builder.inlineAll();
}

function buildGbStudioPatch(task: ProviderTaskPackage, plan: GbStudioPlan): { patch: string; filesTouched: string[] } {
  const filesTouched: string[] = [];
  const diffParts: string[] = [];
  const blueprint = buildDungeonBlueprint(plan);
  const sceneSlug = normalizeName(plan.sceneName, "scene-one");

  const projectFile = firstFile(task, (file) => file.path.endsWith(".gbsproj"));
  if (projectFile) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(projectFile.content) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const updated = {
      ...parsed,
      ...buildGbStudioProjectDocument(plan, blueprint, sceneSlug),
      bossRaid: {
        sceneName: plan.sceneName,
        coreMechanic: plan.coreMechanic,
        palette: plan.palette,
        milestones: plan.milestonePlan,
        roomPlan: plan.roomPlan,
        assetPlan: plan.assetPlan,
      },
    };
    const nextContent = JSON.stringify(updated, null, 2) + "\n";
    diffParts.push(buildUnifiedDiff(projectFile.path, projectFile.content, nextContent));
    filesTouched.push(projectFile.path);
  }

  const encounterFile = firstFile(task, (file) => file.path.includes("encounter"));
  if (encounterFile) {
    const nextContent = buildEncounterModule(plan, blueprint);
    diffParts.push(buildUnifiedDiff(encounterFile.path, encounterFile.content, nextContent));
    filesTouched.push(encounterFile.path);
  }

  const timerFile = firstFile(task, (file) => file.path.endsWith("timer.ts"));
  if (timerFile) {
    const nextContent = buildTimerModule();
    diffParts.push(buildUnifiedDiff(timerFile.path, timerFile.content, nextContent));
    filesTouched.push(timerFile.path);
  }

  const slimeKingFile = firstFile(task, (file) => file.path.endsWith("slime-king.ts"));
  if (slimeKingFile) {
    const nextContent = buildSlimeKingModule(plan, blueprint);
    diffParts.push(buildUnifiedDiff(slimeKingFile.path, slimeKingFile.content, nextContent));
    filesTouched.push(slimeKingFile.path);
  }

  const exitDoorFile = firstFile(task, (file) => file.path.endsWith("exit-door.ts"));
  if (exitDoorFile) {
    const nextContent = buildExitDoorModule(blueprint);
    diffParts.push(buildUnifiedDiff(exitDoorFile.path, exitDoorFile.content, nextContent));
    filesTouched.push(exitDoorFile.path);
  }

  const sceneFile = firstFile(task, (file) => file.path.endsWith("dungeon-vault.scene.json"));
  if (sceneFile) {
    const nextContent = JSON.stringify(buildSceneDocument(plan, blueprint), null, 2) + "\n";
    diffParts.push(buildUnifiedDiff(sceneFile.path, sceneFile.content, nextContent));
    filesTouched.push(sceneFile.path);
  }

  const hudFile = firstFile(task, (file) => file.path.endsWith("ui-hud.json"));
  if (hudFile) {
    const nextContent = JSON.stringify(buildHudDocument(blueprint), null, 2) + "\n";
    diffParts.push(buildUnifiedDiff(hudFile.path, hudFile.content, nextContent));
    filesTouched.push(hudFile.path);
  }

  const briefFile = firstFile(task, (file) => file.path.endsWith("creative-brief.md"));
  if (briefFile) {
    const nextContent = buildCreativeBrief(plan);
    diffParts.push(buildUnifiedDiff(briefFile.path, briefFile.content, nextContent));
    filesTouched.push(briefFile.path);
  }

  return {
    patch: diffParts.join("\n\n"),
    filesTouched,
  };
}

function fallbackPixelPlan(task: ProviderTaskPackage): PixelPlan {
  const title = extractGameTitle(task);
  return {
    artDirection: `${title} should read as clean Game Boy pixel art with one warm accent color.`,
    palette: extractPalette(task, ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"]),
    assetList: ["player", "slime enemy", "vault key", "exit door", "floor tile", "wall tile", "hud icons"],
    notes: [
      "Keep the silhouettes readable at 16x16.",
      "Reuse the same palette across gameplay, art, and trailer.",
    ],
    summary: `Deliver a compact pixel pack for ${title} with gameplay sprites, tiles, and HUD support art.`,
  };
}

async function buildPixelPlan(task: ProviderTaskPackage): Promise<PixelPlan> {
  const fallback = fallbackPixelPlan(task);
  const planned = await planWithVenice<PixelPlan>(
    {
      name: "dottie_pixel_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["artDirection", "palette", "assetList", "notes", "summary"],
        properties: {
          artDirection: { type: "string" },
          palette: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          assetList: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
          notes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          summary: { type: "string" },
        },
      },
    },
    "You are Dottie, a pixel artist inside Boss Raid. Turn the request into a compact asset pack plan with a coherent palette and only the assets the build actually needs.",
    JSON.stringify({ task: task.task, synthesis: task.synthesis }, null, 2),
  ).catch(() => undefined);
  return planned ?? fallback;
}

function producePixelBundle(plan: PixelPlan) {
  const builder = new ArtifactBuilder("dottie");
  const palette = plan.palette.length >= 4 ? plan.palette : ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"];
  const colors = buildPalette(palette);
  const assets = plan.assetList.map((asset, index) => {
    const bitmap = createSimpleSprite(16, 16, colors, inferAssetKind(asset), index);
    const relativePath = joinArtifactPath("pixel-pack", `${normalizeName(asset, `asset-${index + 1}`)}.png`);
    builder.writeBinary(relativePath, encodePng(bitmap), "image/png");
    return { name: asset, relativePath };
  });

  const sheet = new Bitmap(assets.length * 20 + 4, 24, colors[0]);
  assets.forEach((asset, index) => {
    const sprite = createSimpleSprite(16, 16, colors, inferAssetKind(asset.name), index);
    sheet.blit(sprite, 4 + index * 20, 4);
  });
  builder.writeBinary(joinArtifactPath("pixel-pack", "spritesheet.png"), encodePng(sheet), "image/png");
  builder.writeJson(joinArtifactPath("pixel-pack", "metadata.json"), {
    artDirection: plan.artDirection,
    palette: palette.map(toHex),
    assets,
    notes: plan.notes,
  });
  builder.writeText(joinArtifactPath("pixel-pack", "README.md"), `# Dottie Pixel Pack\n\n${plan.summary}\n`);
  return builder.inlineAll();
}

function fallbackVideoPlan(task: ProviderTaskPackage): VideoPlan {
  const title = extractGameTitle(task);
  return {
    projectTitle: title,
    format: "12-second teaser",
    durationSec: 12,
    visualStyle: "retro kinetic typography over chunky gameplay stills",
    musicMood: "urgent chiptune pulse",
    scriptSummary: `Sell ${title} as a fast, readable microgame with a key, a slime, and a timer.`,
    beatSheet: [
      "Find the key before the slime closes the lane.",
      "Read the pattern, move clean, and open the exit.",
      "Boss Raid: Slime Panic. Clear the room before the clock wins.",
    ],
    compositionPlan: [
      "Open on the timer and the room layout.",
      "Cut to the slime lane and key pickup.",
      "Land on the title card and CTA.",
    ],
    renderNotes: ["Keep captions readable in one glance.", "Use the same palette as the gameplay and art pack."],
    palette: extractPalette(task, ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"]),
    launchCopy: ["A one-room Game Boy microgame with timer pressure.", "Dodge the slime. Grab the key. Hit the exit."],
  };
}

async function buildVideoPlan(task: ProviderTaskPackage): Promise<VideoPlan> {
  const fallback = fallbackVideoPlan(task);
  const planned = await planWithVenice<VideoPlan>(
    {
      name: "riko_video_plan",
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "projectTitle",
          "format",
          "durationSec",
          "visualStyle",
          "musicMood",
          "scriptSummary",
          "beatSheet",
          "compositionPlan",
          "renderNotes",
          "palette",
          "launchCopy",
        ],
        properties: {
          projectTitle: { type: "string" },
          format: { type: "string" },
          durationSec: { type: "number" },
          visualStyle: { type: "string" },
          musicMood: { type: "string" },
          scriptSummary: { type: "string" },
          beatSheet: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          compositionPlan: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
          renderNotes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          palette: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          launchCopy: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
        },
      },
    },
    "You are Riko, a video marketer inside Boss Raid. Turn the request into a short teaser plan, beat sheet, and launch copy that match the supplied game brief.",
    JSON.stringify({ task: task.task, synthesis: task.synthesis }, null, 2),
  ).catch(() => undefined);
  return planned ?? fallback;
}

function produceVideoBundle(plan: VideoPlan) {
  const builder = new ArtifactBuilder("riko");
  const palette = plan.palette.length >= 4 ? plan.palette : ["#0F1C2E", "#FFDA47", "#F65D5D", "#77F6C5"];
  const frames = plan.beatSheet.slice(0, 3).map((beat, index) =>
    renderStoryFrame(320, 180, palette, `${plan.projectTitle} ${index + 1}`, beat, plan.visualStyle, index),
  );
  const framePaths: string[] = [];

  frames.forEach((bitmap, index) => {
    const relativePath = joinArtifactPath("video-preview", "frames", `frame-${String(index + 1).padStart(2, "0")}.png`);
    builder.writeBinary(relativePath, encodePng(bitmap), "image/png");
    framePaths.push(relativePath);
  });

  const storyboard = new Bitmap(320 * 3, 180, parseHexColor(palette[0]));
  frames.forEach((frame, index) => {
    storyboard.blit(frame, index * 320, 0);
  });
  builder.writeBinary(joinArtifactPath("video-preview", "storyboard.png"), encodePng(storyboard), "image/png");
  builder.writeBinary(
    joinArtifactPath("video-preview", "preview.gif"),
    encodeGifAnimation(frames, {
      delayCs: Math.max(60, Math.round((Math.max(3, plan.durationSec) * 100) / Math.max(1, frames.length))),
      loopCount: 0,
    }),
    "image/gif",
  );
  builder.writeText(
    joinArtifactPath("video-preview", "captions.srt"),
    plan.beatSheet
      .slice(0, 3)
      .map((beat, index) => `${index + 1}\n00:00:0${index * 2},000 --> 00:00:0${index * 2 + 2},000\n${beat}\n`)
      .join("\n"),
    "application/x-subrip",
  );
  builder.writeJson(joinArtifactPath("video-preview", "plan.json"), plan);
  builder.writeText(
    joinArtifactPath("video-preview", "remotion", "package.json"),
    JSON.stringify(
      {
        name: normalizeName(plan.projectTitle, "riko-remotion"),
        private: true,
        scripts: { render: "remotion render src/index.ts Promo out/promo.mp4" },
        dependencies: {
          remotion: "^4.0.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
        },
      },
      null,
      2,
    ) + "\n",
    "application/json",
  );
  builder.writeText(
    joinArtifactPath("video-preview", "remotion", "src", "Promo.tsx"),
    `import React from "react";\nimport { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";\n\nconst beats = ${JSON.stringify(plan.beatSheet, null, 2)};\n\nexport const Promo: React.FC = () => {\n  const frame = useCurrentFrame();\n  return (\n    <AbsoluteFill style={{ backgroundColor: "${plan.palette[0]}", color: "${plan.palette[3]}", fontFamily: "sans-serif", justifyContent: "center", alignItems: "center" }}>\n      {beats.map((beat, index) => (\n        <Sequence key={index} from={index * 60} durationInFrames={60}>\n          <div style={{ opacity: interpolate(frame, [index * 60, index * 60 + 15], [0, 1], { extrapolateRight: "clamp" }), width: "80%", fontSize: 42, textAlign: "center" }}>{beat}</div>\n        </Sequence>\n      ))}\n    </AbsoluteFill>\n  );\n};\n`,
  );
  builder.writeText(
    joinArtifactPath("video-preview", "remotion", "src", "Root.tsx"),
    `import React from "react";\nimport { Composition } from "remotion";\nimport { Promo } from "./Promo";\n\nexport const RemotionRoot: React.FC = () => (\n  <Composition id="Promo" component={Promo} width={1280} height={720} fps={30} durationInFrames={${Math.max(
      90,
      plan.beatSheet.length * 60,
    )}} defaultProps={{}} />\n);\n`,
  );
  builder.writeText(
    joinArtifactPath("video-preview", "remotion", "src", "index.ts"),
    `import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\n\nregisterRoot(RemotionRoot);\n`,
  );

  const frameGlob = `${builder.root}/video-preview/frames/frame-%02d.png`;
  const mp4Output = `${builder.root}/video-preview/preview.mp4`;
  if (
    tryRunFfmpeg([
      "-y",
      "-framerate",
      "1",
      "-i",
      frameGlob,
      "-vf",
      "scale=640:360:flags=neighbor,format=yuv420p",
      "-t",
      "6",
      mp4Output,
    ])
  ) {
    const mp4Buffer = spawnSync("cat", [mp4Output], { encoding: null }).stdout;
    if (mp4Buffer) {
      builder.writeBinary(joinArtifactPath("video-preview", "preview.mp4"), mp4Buffer, "video/mp4");
    }
  }

  builder.writeText(joinArtifactPath("video-preview", "README.md"), `# ${plan.projectTitle}\n\n${plan.scriptSummary}\n`);
  return builder.inlineAll();
}

async function buildGenericTextPlan(task: ProviderTaskPackage): Promise<TextPlan> {
  const fallback: TextPlan = {
    answerText: `Mercenary asked ${providerConfig.displayName} for a scoped contribution. ${task.task.description}`,
    explanation: "Produced a constrained text answer from the supplied task package and workstream scope.",
    confidence: 0.66,
  };

  const planned = await planWithVenice<TextPlan>(
    {
      name: "generic_text_answer",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["answerText", "explanation", "confidence"],
        properties: {
          answerText: { type: "string" },
          explanation: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
    "You are a specialist provider inside Boss Raid. Give one concise contribution for Mercenary to synthesize. Do not mention hidden chain-of-thought.",
    JSON.stringify({ task: task.task, synthesis: task.synthesis, artifacts: task.artifacts }, null, 2),
  ).catch(() => undefined);
  return planned ?? fallback;
}

function domainMatchesMode(mode: ProviderMode, task: ProviderTaskPackage): boolean {
  const haystack = [
    task.task.framework ?? "",
    task.task.description,
    task.synthesis?.workstreamLabel ?? "",
    task.synthesis?.roleLabel ?? "",
  ]
    .join("\n")
    .toLowerCase();

  if (mode === "gbstudio") {
    return haystack.includes("gb-studio") || haystack.includes("gameplay");
  }
  if (mode === "pixel_art") {
    return haystack.includes("pixel") || haystack.includes("sprite") || haystack.includes("art");
  }
  if (mode === "remotion") {
    return haystack.includes("remotion") || haystack.includes("promo") || haystack.includes("video");
  }
  return false;
}

function describeBundleArtifacts(
  bundle: ReturnType<ArtifactBuilder["inlineAll"]>,
  prefix: string,
  options: {
    allowVideoFallback?: boolean;
  } = {},
): SubmissionArtifact[] {
  const files = bundle.files;
  const videoHighlights: SubmissionArtifact[] = [];
  const imageHighlights: SubmissionArtifact[] = [];
  const fallbackVideoFile =
    options.allowVideoFallback
      ? files.find((file) => file.relativePath.endsWith("preview.gif")) ??
        files.find((file) => file.relativePath.endsWith("storyboard.png")) ??
        files.find((file) => file.relativePath.endsWith("frames/frame-01.png")) ??
        files.find((file) => file.mimeType.startsWith("image/"))
      : undefined;

  for (const file of files) {
    if (file.mimeType.startsWith("video/")) {
      videoHighlights.push(createFileArtifact("video", `${prefix} preview`, "Generated video artifact.", file));
      continue;
    }
    if (file.mimeType.startsWith("image/")) {
      imageHighlights.push(createFileArtifact("image", `${prefix} ${file.relativePath}`, "Generated image artifact.", file));
    }
  }

  if (videoHighlights.length === 0 && fallbackVideoFile) {
    videoHighlights.push(
      createFileArtifact(
        "video",
        `${prefix} storyboard preview`,
        "Storyboard fallback used when encoded video output was unavailable.",
        fallbackVideoFile,
      ),
    );
  }

  const visibleImages = fallbackVideoFile
    ? imageHighlights.filter((artifact) => artifact.uri !== `data:${fallbackVideoFile.mimeType};base64,${fallbackVideoFile.data}`)
    : imageHighlights;

  return uniqueArtifacts([
    ...videoHighlights.slice(0, 1),
    ...visibleImages.slice(0, 5),
    createBundleArtifact(bundle, `${prefix} bundle`, `Inline bundle with ${bundle.files.length} generated files.`),
  ]);
}

function uniqueArtifacts(artifacts: SubmissionArtifact[]): SubmissionArtifact[] {
  const seen = new Set<string>();
  const output: SubmissionArtifact[] = [];
  for (const artifact of artifacts) {
    const key = `${artifact.outputType}:${artifact.uri}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(artifact);
  }
  return output;
}

export async function maybeRequestSpecializedSubmission(
  task: ProviderTaskPackage,
): Promise<ModelSubmission | undefined> {
  const mode = providerConfig.providerMode as ProviderMode;
  if (mode === "generic") {
    return undefined;
  }

  if (!domainMatchesMode(mode, task) && task.desiredOutput.primaryType === "text") {
    const generic = await buildGenericTextPlan(task);
    return {
      answerText: generic.answerText,
      explanation: generic.explanation,
      confidence: generic.confidence,
      filesTouched: [],
      artifacts: [],
    };
  }

  if (mode === "gbstudio") {
    const plan = await buildGbStudioPlan(task);
    const bundle = produceGbStudioBundle(plan);
    const patch = buildGbStudioPatch(task, plan);
    return {
      patchUnifiedDiff: task.desiredOutput.primaryType === "patch" ? patch.patch : undefined,
      answerText:
        task.desiredOutput.primaryType === "text"
          ? `${plan.conceptSummary}\n\nGameplay scope:\n${plan.gameplayChanges.map((item) => `- ${item}`).join("\n")}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, "Gamma"),
      explanation: `${plan.patchSummary} Mercenary can use the inline GB Studio bundle for receipt proof and downstream handoff.`,
      confidence: 0.82,
      filesTouched: task.desiredOutput.primaryType === "patch" ? patch.filesTouched : [],
    };
  }

  if (mode === "pixel_art") {
    const plan = await buildPixelPlan(task);
    const bundle = producePixelBundle(plan);
    return {
      answerText:
        task.desiredOutput.primaryType === "text"
          ? `${plan.summary}\n\nAsset list:\n${plan.assetList.map((item) => `- ${item}`).join("\n")}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, "Dottie"),
      explanation: `${plan.summary} Included inline pixel-art files, a spritesheet, and bundle metadata.`,
      confidence: 0.8,
      filesTouched: [],
    };
  }

  if (mode === "remotion") {
    const plan = await buildVideoPlan(task);
    const bundle = produceVideoBundle(plan);
    return {
      answerText:
        task.desiredOutput.primaryType === "text"
          ? `${plan.scriptSummary}\n\nLaunch copy:\n${plan.launchCopy.map((item) => `- ${item}`).join("\n")}`
          : undefined,
      artifacts: describeBundleArtifacts(bundle, "Riko", { allowVideoFallback: true }),
      explanation: `${plan.scriptSummary} Included storyboard frames, captions, Remotion source, and a playable preview render with MP4 preferred and animated GIF fallback.`,
      confidence: 0.8,
      filesTouched: [],
    };
  }

  return undefined;
}

export function attachContributionRole(submission: ModelSubmission, task: ProviderTaskPackage): ModelSubmission {
  if (task.synthesis == null) {
    return submission;
  }

  return {
    ...submission,
    contributionRole: {
      id: task.synthesis.roleId,
      label: task.synthesis.roleLabel,
      objective: task.synthesis.roleObjective,
      workstreamId: task.synthesis.workstreamId,
      workstreamLabel: task.synthesis.workstreamLabel,
      workstreamObjective: task.synthesis.workstreamObjective,
    },
  };
}

export function submissionSupportsRequestedOutput(submission: ModelSubmission, task: ProviderTaskPackage): boolean {
  const primaryType = task.desiredOutput.primaryType;
  if (primaryType === "patch") {
    return typeof submission.patchUnifiedDiff === "string" && submission.patchUnifiedDiff.length > 0;
  }
  if (primaryType === "text" || primaryType === "json") {
    return typeof submission.answerText === "string" && submission.answerText.length > 0;
  }
  return (
    Array.isArray(submission.artifacts) &&
    submission.artifacts.some((artifact) => artifact.outputType === primaryType)
  );
}

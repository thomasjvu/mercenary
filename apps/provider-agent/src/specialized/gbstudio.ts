import type { ProviderTaskPackage } from '@bossraid/shared-types';
import { ArtifactBuilder, joinArtifactPath } from '../artifacts.js';
import { Bitmap, encodePng, parseHexColor, type RgbaColor } from '../bitmap.js';
import {
  buildPalette,
  buildUnifiedDiff,
  createSimpleSprite,
  createSpriteSheet,
  extractGameTitle,
  extractPalette,
  firstFile,
  normalizeName,
  planWithVenice,
  quotedList,
  shortText,
  toHex,
} from './pixel.js';

export type GbStudioPlan = {
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
      '####################',
      '#........##........#',
      '#.###....##....###.#',
      '#..K.....##........#',
      '#........##..###...#',
      '#..####......###...#',
      '#........SS........#',
      '#........SS........#',
      '#..###........###..#',
      '#..###........###..#',
      '#........##........#',
      '#...###..##..###...#',
      '#........##........#',
      '#........##.....D..#',
      '#..####........###.#',
      '#........##........#',
      '#........##........#',
      '####################',
    ],
  };
}

function drawDungeonRoomPreview(blueprint: DungeonBlueprint, colors: RgbaColor[]): Bitmap {
  const tileSize = 8;
  const bitmap = new Bitmap(blueprint.width * tileSize, blueprint.height * tileSize, colors[0]);
  const floor = colors[0] ?? parseHexColor('0F1C2E');
  const wall = colors[1] ?? parseHexColor('FFDA47');
  const danger = colors[2] ?? parseHexColor('F65D5D');
  const accent = colors[3] ?? parseHexColor('77F6C5');

  blueprint.tilemap.forEach((row, rowIndex) => {
    [...row].forEach((cell, columnIndex) => {
      const x = columnIndex * tileSize;
      const y = rowIndex * tileSize;
      bitmap.fillRect(x, y, tileSize, tileSize, floor);

      if (cell === '#') {
        bitmap.fillRect(x, y, tileSize, tileSize, wall);
        bitmap.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2, floor);
        bitmap.fillRect(x + 2, y + 2, tileSize - 4, 1, accent);
        return;
      }

      if ((columnIndex + rowIndex) % 2 === 0) {
        bitmap.fillRect(x + 1, y + 1, 2, 2, accent);
        bitmap.fillRect(x + 5, y + 5, 1, 1, accent);
      }

      if (cell === 'K') {
        bitmap.blit(createSimpleSprite(8, 8, colors, 'key', 0), x, y);
      } else if (cell === 'D') {
        bitmap.blit(createSimpleSprite(8, 8, colors, 'door', 0), x, y);
      } else if (cell === 'S') {
        bitmap.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2, danger);
      }
    });
  });

  bitmap.fillRect(
    blueprint.playerSpawn.x * tileSize + 2,
    blueprint.playerSpawn.y * tileSize + 2,
    4,
    4,
    accent
  );
  bitmap.drawText('30', 8, 8, wall, { scale: 1 });
  bitmap.drawText('KEY', 116, 8, wall, { scale: 1 });
  return bitmap;
}

function buildGbStudioProjectDocument(
  plan: GbStudioPlan,
  blueprint: DungeonBlueprint,
  sceneSlug: string
) {
  return {
    _resourceType: 'project',
    name: plan.title,
    author: 'Boss Raid / Gamma',
    notes: plan.conceptSummary,
    engine: 'gb-studio',
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
      { id: `${sceneSlug}-player`, name: 'player', filename: 'player.png', frames: 4 },
      { id: `${sceneSlug}-slime`, name: 'slime-king', filename: 'slime-king.png', frames: 2 },
      { id: `${sceneSlug}-key`, name: 'vault-key', filename: 'vault-key.png', frames: 2 },
      { id: `${sceneSlug}-door`, name: 'exit-door', filename: 'exit-door.png', frames: 2 },
    ],
    backgrounds: [
      { id: `${sceneSlug}-background`, name: blueprint.name, filename: `${sceneSlug}.png` },
    ],
    palettes: [
      { id: 'default-bg-1', name: 'Default BG 1', colors: plan.palette.map(toHex) },
      { id: 'default-sprite', name: 'Default Sprites', colors: plan.palette.map(toHex) },
    ],
  };
}

function buildEncounterModule(plan: GbStudioPlan, blueprint: DungeonBlueprint): string {
  return [
    'export const bossRaidPitch = {',
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
    '};',
    '',
  ].join('\n');
}

function buildTimerModule(): string {
  return [
    'export const slimePanicTimer = {',
    '  totalSeconds: 30,',
    '  warningSeconds: 10,',
    '  loseState: "timer-expired"',
    '};',
    '',
    'export function stepEncounterTimer(secondsRemaining: number, deltaSeconds: number): number {',
    '  return Math.max(0, Number((secondsRemaining - deltaSeconds).toFixed(2)));',
    '}',
    '',
    'export function shouldTriggerWarning(secondsRemaining: number): boolean {',
    '  return secondsRemaining <= slimePanicTimer.warningSeconds;',
    '}',
    '',
  ].join('\n');
}

function buildSlimeKingModule(plan: GbStudioPlan, blueprint: DungeonBlueprint): string {
  return [
    'export type GridPoint = { x: number; y: number };',
    '',
    'export type SlimeKingState = {',
    '  patrolRoute: GridPoint[];',
    '  routeIndex: number;',
    '  detectionRadius: number;',
    '  speed: number;',
    '};',
    '',
    'export const defaultSlimeKingState: SlimeKingState = {',
    `  patrolRoute: ${JSON.stringify(blueprint.patrolRoute)},`,
    '  routeIndex: 0,',
    '  detectionRadius: 5,',
    '  speed: 1',
    '};',
    '',
    'export function chooseSlimeKingTarget(state: SlimeKingState, player: GridPoint, hasKey: boolean): GridPoint {',
    '  if (hasKey) {',
    '    return player;',
    '  }',
    '',
    '  return state.patrolRoute[state.routeIndex] ?? player;',
    '}',
    '',
    'export function buildSlimeKingTaunt(): string {',
    `  return ${JSON.stringify(plan.npcLine)};`,
    '}',
    '',
  ].join('\n');
}

function buildExitDoorModule(blueprint: DungeonBlueprint): string {
  return [
    'export type ExitGateState = {',
    '  locked: boolean;',
    '  prompt: string;',
    '  location: { x: number; y: number };',
    '};',
    '',
    'export function resolveExitGateState(hasKey: boolean, timerExpired: boolean): ExitGateState {',
    '  if (timerExpired) {',
    `    return { locked: true, prompt: "Too late. Restart the room.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    '  }',
    '',
    '  if (!hasKey) {',
    `    return { locked: true, prompt: "Find the vault key first.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    '  }',
    '',
    `  return { locked: false, prompt: "Exit unlocked. Move.", location: ${JSON.stringify(blueprint.exitDoor)} };`,
    '}',
    '',
  ].join('\n');
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
      anchor: 'top-left',
      format: '00:30',
      warningThreshold: 10,
    },
    keyIcon: {
      anchor: 'top-right',
      emptyState: 'outline',
      filledState: 'filled',
    },
    prompts: {
      start: 'Get the key. Reach the exit.',
      fail: 'The vault resets.',
      exit: `Door at ${blueprint.exitDoor.x},${blueprint.exitDoor.y}`,
    },
  };
}

function buildCreativeBrief(plan: GbStudioPlan): string {
  return [
    `# ${plan.title}`,
    '',
    `Tone: ${plan.tone}.`,
    'Audience: players who like tiny retro challenge games.',
    'Deliverables: gameplay patch, pixel pack, teaser clip, and launch copy.',
    '',
    '## Shared Hook',
    plan.coreMechanic,
    '',
    '## Room Plan',
    quotedList(plan.roomPlan),
    '',
    '## Asset Plan',
    quotedList(plan.assetPlan),
    '',
  ].join('\n');
}

function buildGameplayReadme(plan: GbStudioPlan): string {
  return [
    `# ${plan.title}`,
    '',
    plan.conceptSummary,
    '',
    '## Core Mechanic',
    plan.coreMechanic,
    '',
    '## Milestones',
    ...plan.milestonePlan.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Gameplay Changes',
    ...plan.gameplayChanges.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function fallbackGbStudioPlan(task: ProviderTaskPackage): GbStudioPlan {
  const title = extractGameTitle(task);
  const hook = shortText(
    task.task.description.split('.')[0] ?? '',
    'Escape the room before the timer expires.'
  );
  return {
    title,
    genre: 'retro action-puzzle',
    tone: 'playful pressure',
    coreMechanic: hook,
    sceneName: 'Dungeon Vault',
    npcName: 'Slime King',
    npcLine: 'No one leaves the vault without the key.',
    palette: extractPalette(task, ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5']),
    conceptSummary: `${title} is a one-room microgame about reading slime paths, taking the key, and escaping under pressure.`,
    milestonePlan: [
      'Lock the Dungeon Vault room layout with one readable patrol lane.',
      'Wire timer pressure, key pickup, and exit unlock into one complete run.',
      'Align the art pack and teaser to the same one-room escape story.',
    ],
    roomPlan: [
      'Place the player on the left lane, the key at the upper pressure point, and the exit at the lower-right vault door.',
      'Keep the Slime King in the center patrol box until the key is collected, then switch to chase pressure.',
      'Show the timer and key state in the HUD so the win condition reads in one glance.',
    ],
    assetPlan: [
      'player walk sheet',
      'slime king bounce sheet',
      'vault key pickup sprite',
      'exit door open and closed sprite',
      'dungeon floor tile',
      'dungeon wall tile',
      'timer and key HUD icons',
    ],
    patchSummary:
      'Replace the thin demo scaffold with a concrete Dungeon Vault room package, gameplay scripts, and supporting GB Studio data files.',
    gameplayChanges: [
      'Update the project manifest with concrete scene, background, and sprite sheet entries.',
      'Implement timer, Slime King target selection, exit gating, and room blueprint data.',
      'Align the creative brief to the same concrete room layout and asset list.',
    ],
  };
}

export async function buildGbStudioPlan(task: ProviderTaskPackage): Promise<GbStudioPlan> {
  const fallback = fallbackGbStudioPlan(task);
  const planned = await planWithVenice<GbStudioPlan>(
    {
      name: 'gamma_gbstudio_plan',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'genre',
          'tone',
          'coreMechanic',
          'sceneName',
          'npcName',
          'npcLine',
          'palette',
          'conceptSummary',
          'milestonePlan',
          'roomPlan',
          'assetPlan',
          'patchSummary',
          'gameplayChanges',
        ],
        properties: {
          title: { type: 'string' },
          genre: { type: 'string' },
          tone: { type: 'string' },
          coreMechanic: { type: 'string' },
          sceneName: { type: 'string' },
          npcName: { type: 'string' },
          npcLine: { type: 'string' },
          palette: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          conceptSummary: { type: 'string' },
          milestonePlan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
          roomPlan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
          assetPlan: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 8 },
          patchSummary: { type: 'string' },
          gameplayChanges: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
        },
      },
    },
    'You are Gamma, a game developer inside Boss Raid. Plan one small playable game slice. Keep the plan concrete and consistent with the supplied repo context.',
    JSON.stringify(
      {
        task: task.task,
        synthesis: task.synthesis,
        files: task.artifacts.files.map((file) => ({ path: file.path, content: file.content })),
      },
      null,
      2
    )
  ).catch(() => undefined);
  return planned ?? fallback;
}

export function produceGbStudioBundle(plan: GbStudioPlan) {
  const builder = new ArtifactBuilder('gamma');
  const palette =
    plan.palette.length >= 4 ? plan.palette : ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5'];
  const colors = buildPalette(palette);
  const sceneSlug = normalizeName(plan.sceneName, 'scene-one');
  const blueprint = buildDungeonBlueprint(plan);
  const background = drawDungeonRoomPreview(blueprint, colors);
  const playerSheet = createSpriteSheet(16, 16, colors, 'hero', 4);
  const slimeSheet = createSpriteSheet(16, 16, colors, 'slime', 2);
  const keySheet = createSpriteSheet(16, 16, colors, 'key', 2);
  const doorSheet = createSpriteSheet(16, 32, colors, 'door', 2);
  const floorTile = createSimpleSprite(16, 16, colors, 'floor_tile', 0);
  const wallTile = createSimpleSprite(16, 16, colors, 'wall_tile', 0);
  const hudIcons = createSpriteSheet(16, 16, colors, 'ui', 2);

  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'backgrounds', `${sceneSlug}.png`),
    encodePng(background),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'sprites', 'player.png'),
    encodePng(playerSheet),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'sprites', 'slime-king.png'),
    encodePng(slimeSheet),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'sprites', 'vault-key.png'),
    encodePng(keySheet),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'sprites', 'exit-door.png'),
    encodePng(doorSheet),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'tiles', 'floor-tile.png'),
    encodePng(floorTile),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'tiles', 'wall-tile.png'),
    encodePng(wallTile),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('game', 'assets', 'ui', 'hud-icons.png'),
    encodePng(hudIcons),
    'image/png'
  );
  builder.writeJson(
    joinArtifactPath('game', 'project.gbsproj'),
    buildGbStudioProjectDocument(plan, blueprint, sceneSlug)
  );
  builder.writeText(
    joinArtifactPath('game', 'scripts', 'encounter.ts'),
    buildEncounterModule(plan, blueprint)
  );
  builder.writeText(joinArtifactPath('game', 'scripts', 'timer.ts'), buildTimerModule());
  builder.writeText(
    joinArtifactPath('game', 'scripts', 'slime-king.ts'),
    buildSlimeKingModule(plan, blueprint)
  );
  builder.writeText(
    joinArtifactPath('game', 'scripts', 'exit-door.ts'),
    buildExitDoorModule(blueprint)
  );
  builder.writeJson(
    joinArtifactPath('game', 'data', 'dungeon-vault.scene.json'),
    buildSceneDocument(plan, blueprint)
  );
  builder.writeJson(joinArtifactPath('game', 'data', 'ui-hud.json'), buildHudDocument(blueprint));
  builder.writeJson(joinArtifactPath('game', 'design', 'notes.json'), {
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
  builder.writeText(joinArtifactPath('game', 'README.md'), buildGameplayReadme(plan));
  builder.writeText(
    joinArtifactPath('marketing', 'launch-copy.md'),
    `# Launch Copy\n\n${plan.title}\n\n${plan.coreMechanic}\n\n- Dodge the ${plan.npcName.toLowerCase()}.\n- Grab the key.\n- Reach the door before the clock wins.\n`
  );

  return builder.inlineAll();
}

export function buildGbStudioPatch(
  task: ProviderTaskPackage,
  plan: GbStudioPlan
): { patch: string; filesTouched: string[] } {
  const filesTouched: string[] = [];
  const diffParts: string[] = [];
  const blueprint = buildDungeonBlueprint(plan);
  const sceneSlug = normalizeName(plan.sceneName, 'scene-one');

  const projectFile = firstFile(task, (file) => file.path.endsWith('.gbsproj'));
  if (projectFile) {
    let parsed: Record<string, unknown>;
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
    const nextContent = JSON.stringify(updated, null, 2) + '\n';
    diffParts.push(buildUnifiedDiff(projectFile.path, projectFile.content, nextContent));
    filesTouched.push(projectFile.path);
  }

  const encounterFile = firstFile(task, (file) => file.path.includes('encounter'));
  if (encounterFile) {
    const nextContent = buildEncounterModule(plan, blueprint);
    diffParts.push(buildUnifiedDiff(encounterFile.path, encounterFile.content, nextContent));
    filesTouched.push(encounterFile.path);
  }

  const timerFile = firstFile(task, (file) => file.path.endsWith('timer.ts'));
  if (timerFile) {
    const nextContent = buildTimerModule();
    diffParts.push(buildUnifiedDiff(timerFile.path, timerFile.content, nextContent));
    filesTouched.push(timerFile.path);
  }

  const slimeKingFile = firstFile(task, (file) => file.path.endsWith('slime-king.ts'));
  if (slimeKingFile) {
    const nextContent = buildSlimeKingModule(plan, blueprint);
    diffParts.push(buildUnifiedDiff(slimeKingFile.path, slimeKingFile.content, nextContent));
    filesTouched.push(slimeKingFile.path);
  }

  const exitDoorFile = firstFile(task, (file) => file.path.endsWith('exit-door.ts'));
  if (exitDoorFile) {
    const nextContent = buildExitDoorModule(blueprint);
    diffParts.push(buildUnifiedDiff(exitDoorFile.path, exitDoorFile.content, nextContent));
    filesTouched.push(exitDoorFile.path);
  }

  const sceneFile = firstFile(task, (file) => file.path.endsWith('dungeon-vault.scene.json'));
  if (sceneFile) {
    const nextContent = JSON.stringify(buildSceneDocument(plan, blueprint), null, 2) + '\n';
    diffParts.push(buildUnifiedDiff(sceneFile.path, sceneFile.content, nextContent));
    filesTouched.push(sceneFile.path);
  }

  const hudFile = firstFile(task, (file) => file.path.endsWith('ui-hud.json'));
  if (hudFile) {
    const nextContent = JSON.stringify(buildHudDocument(blueprint), null, 2) + '\n';
    diffParts.push(buildUnifiedDiff(hudFile.path, hudFile.content, nextContent));
    filesTouched.push(hudFile.path);
  }

  const briefFile = firstFile(task, (file) => file.path.endsWith('creative-brief.md'));
  if (briefFile) {
    const nextContent = buildCreativeBrief(plan);
    diffParts.push(buildUnifiedDiff(briefFile.path, briefFile.content, nextContent));
    filesTouched.push(briefFile.path);
  }

  return {
    patch: diffParts.join('\n\n'),
    filesTouched,
  };
}

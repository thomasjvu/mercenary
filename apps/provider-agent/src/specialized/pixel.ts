import type { ProviderTaskPackage, TaskFile } from '@bossraid/shared-types';
import { providerConfig } from '../config.js';
import { ArtifactBuilder, joinArtifactPath } from '../artifacts.js';
import { Bitmap, encodePng, parseHexColor, type RgbaColor } from '../bitmap.js';
import { generateStructuredWithVenice } from '../venice.js';

export type PixelPlan = {
  artDirection: string;
  palette: string[];
  assetList: string[];
  notes: string[];
  summary: string;
};

function normalizeName(value: string, fallback: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
}

function toHex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

function buildPalette(colors: string[]): RgbaColor[] {
  return colors.map((color) => parseHexColor(color));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function extractPalette(task: ProviderTaskPackage, fallback: string[]): string[] {
  const matches =
    `${task.task.description}\n${task.artifacts.files.map((file) => file.content).join('\n')}`.match(
      /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g
    );
  const palette = unique((matches ?? []).map((value) => value.toUpperCase()));
  return palette.length >= 4 ? palette.slice(0, 4) : fallback;
}

function extractGameTitle(task: ProviderTaskPackage): string {
  return task.task.title.trim() || 'Boss Raid Microgame';
}

function shortText(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function firstFile(
  task: ProviderTaskPackage,
  predicate: (file: TaskFile) => boolean
): TaskFile | undefined {
  return task.artifacts.files.find(predicate);
}

function quotedList(values: string[]): string {
  return values.map((value) => `- ${value}`).join('\n');
}

function buildUnifiedDiff(path: string, before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const beforeCount = beforeLines.length;
  const afterCount = afterLines.length;
  const beforeBody = beforeLines.map((line) => `-${line}`).join('\n');
  const afterBody = afterLines.map((line) => `+${line}`).join('\n');
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${beforeCount} +1,${afterCount} @@`,
    beforeBody,
    afterBody,
  ].join('\n');
}

type SpriteKind =
  | 'hero'
  | 'npc'
  | 'key'
  | 'slime'
  | 'tree'
  | 'ui'
  | 'door'
  | 'floor_tile'
  | 'wall_tile';

function createSimpleSprite(
  width: number,
  height: number,
  colors: RgbaColor[],
  kind: SpriteKind,
  variant: number
): Bitmap {
  const bitmap = new Bitmap(width, height, { r: 0, g: 0, b: 0, a: 0 });
  const floorBase = colors[0] ?? parseHexColor('0F1C2E');
  const wallBase = colors[1] ?? parseHexColor('FFDA47');
  const accent = colors[2] ?? parseHexColor('F65D5D');
  const outline = colors[3] ?? parseHexColor('77F6C5');
  const light = parseHexColor('F4F1D8');

  if (kind === 'hero' || kind === 'npc') {
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
  } else if (kind === 'key') {
    const sparkleOffset = variant % 2;
    bitmap.fillRect(3, 6, 7, 3, wallBase);
    bitmap.fillRect(10, 5, 2, 5, wallBase);
    bitmap.fillRect(11, 3, 3, 2, wallBase);
    bitmap.fillRect(11, 9, 2, 2, wallBase);
    bitmap.fillRect(8, 8, 2, 3, accent);
    bitmap.fillRect(3 + sparkleOffset, 2, 1, 3, outline);
    bitmap.fillRect(2 + sparkleOffset, 3, 3, 1, outline);
    bitmap.strokeRect(2, 5, 10, 5, outline);
  } else if (kind === 'slime') {
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
  } else if (kind === 'door') {
    const isOpen = variant % 2 === 1;
    bitmap.fillRect(3, 1, 10, 14, wallBase);
    bitmap.fillRect(5, 3, 6, 10, floorBase);
    bitmap.fillRect(8 + (isOpen ? 3 : 0), 8, 1, 1, accent);
    bitmap.strokeRect(3, 1, 10, 14, outline);
    if (height > 16) {
      bitmap.fillRect(5, 16, 6, height - 16, wallBase);
      bitmap.strokeRect(3, 15, 10, height - 15, outline);
    }
  } else if (kind === 'floor_tile') {
    bitmap.fillRect(0, 0, width, height, floorBase);
    for (let y = 2; y < height; y += 4) {
      for (let x = (y / 2) % 4 === 0 ? 1 : 3; x < width; x += 4) {
        bitmap.fillRect(x, y, 2, 1, outline);
      }
    }
    bitmap.strokeRect(0, 0, width, height, outline);
  } else if (kind === 'wall_tile') {
    bitmap.fillRect(0, 0, width, height, wallBase);
    for (let y = 2; y < height; y += 4) {
      bitmap.fillRect(2, y, width - 4, 1, accent);
    }
    bitmap.strokeRect(0, 0, width, height, outline);
  } else if (kind === 'tree') {
    bitmap.fillRect(6, 10, 4, 5, outline);
    bitmap.fillRect(3, 3, 10, 8, accent);
    bitmap.fillRect(5, 5, 6, 4, wallBase);
  } else if (kind === 'ui') {
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
  frameCount: number
): Bitmap {
  const sheet = new Bitmap(frameWidth * frameCount, frameHeight, { r: 0, g: 0, b: 0, a: 0 });
  for (let frame = 0; frame < frameCount; frame += 1) {
    sheet.blit(
      createSimpleSprite(frameWidth, frameHeight, colors, kind, frame),
      frame * frameWidth,
      0
    );
  }
  return sheet;
}

function inferAssetKind(name: string): SpriteKind {
  const lower = name.toLowerCase();
  if (lower.includes('floor')) {
    return 'floor_tile';
  }
  if (lower.includes('wall')) {
    return 'wall_tile';
  }
  if (
    lower.includes('coin') ||
    lower.includes('gem') ||
    lower.includes('pickup') ||
    lower.includes('key')
  ) {
    return 'key';
  }
  if (lower.includes('tree') || lower.includes('plant') || lower.includes('bush')) {
    return 'tree';
  }
  if (lower.includes('door') || lower.includes('exit')) {
    return 'door';
  }
  if (
    lower.includes('ui') ||
    lower.includes('button') ||
    lower.includes('panel') ||
    lower.includes('title')
  ) {
    return 'ui';
  }
  if (lower.includes('monster') || lower.includes('enemy') || lower.includes('slime')) {
    return 'slime';
  }
  if (lower.includes('npc') || lower.includes('guide')) {
    return 'npc';
  }
  return 'hero';
}

function readVeniceRuntime() {
  if (
    !providerConfig.modelApiKey ||
    !providerConfig.modelName ||
    !providerConfig.modelApiBase.includes('venice')
  ) {
    return undefined;
  }

  return {
    apiBase: providerConfig.modelApiBase,
    apiKey: providerConfig.modelApiKey,
    model: providerConfig.modelName,
    reasoningEffort: providerConfig.modelReasoningEffort,
  };
}

export async function planWithVenice<T>(
  schema: Record<string, unknown>,
  systemPrompt: string,
  userPrompt: string
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

export {
  normalizeName,
  toHex,
  buildPalette,
  extractPalette,
  extractGameTitle,
  shortText,
  firstFile,
  quotedList,
  buildUnifiedDiff,
  createSimpleSprite,
  createSpriteSheet,
  inferAssetKind,
};

function fallbackPixelPlan(task: ProviderTaskPackage): PixelPlan {
  const title = extractGameTitle(task);
  return {
    artDirection: `${title} should read as clean Game Boy pixel art with one warm accent color.`,
    palette: extractPalette(task, ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5']),
    assetList: [
      'player',
      'slime enemy',
      'vault key',
      'exit door',
      'floor tile',
      'wall tile',
      'hud icons',
    ],
    notes: [
      'Keep the silhouettes readable at 16x16.',
      'Reuse the same palette across gameplay, art, and trailer.',
    ],
    summary: `Deliver a compact pixel pack for ${title} with gameplay sprites, tiles, and HUD support art.`,
  };
}

export async function buildPixelPlan(task: ProviderTaskPackage): Promise<PixelPlan> {
  const fallback = fallbackPixelPlan(task);
  const planned = await planWithVenice<PixelPlan>(
    {
      name: 'dottie_pixel_plan',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['artDirection', 'palette', 'assetList', 'notes', 'summary'],
        properties: {
          artDirection: { type: 'string' },
          palette: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          assetList: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 8 },
          notes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
          summary: { type: 'string' },
        },
      },
    },
    'You are Dottie, a pixel artist inside Boss Raid. Turn the request into a compact asset pack plan with a coherent palette and only the assets the build actually needs.',
    JSON.stringify({ task: task.task, synthesis: task.synthesis }, null, 2)
  ).catch(() => undefined);
  return planned ?? fallback;
}

export function producePixelBundle(plan: PixelPlan) {
  const builder = new ArtifactBuilder('dottie');
  const palette =
    plan.palette.length >= 4 ? plan.palette : ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5'];
  const colors = buildPalette(palette);
  const assets = plan.assetList.map((asset, index) => {
    const bitmap = createSimpleSprite(16, 16, colors, inferAssetKind(asset), index);
    const relativePath = joinArtifactPath(
      'pixel-pack',
      `${normalizeName(asset, `asset-${index + 1}`)}.png`
    );
    builder.writeBinary(relativePath, encodePng(bitmap), 'image/png');
    return { name: asset, relativePath };
  });

  const sheet = new Bitmap(assets.length * 20 + 4, 24, colors[0]);
  assets.forEach((asset, index) => {
    const sprite = createSimpleSprite(16, 16, colors, inferAssetKind(asset.name), index);
    sheet.blit(sprite, 4 + index * 20, 4);
  });
  builder.writeBinary(
    joinArtifactPath('pixel-pack', 'spritesheet.png'),
    encodePng(sheet),
    'image/png'
  );
  builder.writeJson(joinArtifactPath('pixel-pack', 'metadata.json'), {
    artDirection: plan.artDirection,
    palette: palette.map(toHex),
    assets,
    notes: plan.notes,
  });
  builder.writeText(
    joinArtifactPath('pixel-pack', 'README.md'),
    `# Dottie Pixel Pack\n\n${plan.summary}\n`
  );
  return builder.inlineAll();
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = resolve(
  repoRoot,
  '.private/demo-video/assets/exports/clips/S07-legal-float.mp4'
);
const outputDir = resolve(repoRoot, 'apps/web/src/assets/legal');
const output = resolve(outputDir, 'mercenary-legal-float.webm');

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    source,
    '-vf',
    'fps=24,scale=560:-2:flags=lanczos,colorkey=0xFFFFFF:0.14:0.08,format=rgba',
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-pix_fmt',
    'yuva420p',
    '-auto-alt-ref',
    '0',
    '-crf',
    '44',
    '-b:v',
    '0',
    output,
  ],
  { stdio: 'inherit' }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${output}`);
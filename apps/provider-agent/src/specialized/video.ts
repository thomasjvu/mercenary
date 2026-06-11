import { spawnSync } from 'node:child_process';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import { ArtifactBuilder, joinArtifactPath } from '../artifacts.js';
import { Bitmap, encodeGifAnimation, encodePng, parseHexColor } from '../bitmap.js';
import {
  buildPalette,
  extractGameTitle,
  extractPalette,
  normalizeName,
  planWithVenice,
} from './pixel.js';

export type VideoPlan = {
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

function renderStoryFrame(
  width: number,
  height: number,
  palette: string[],
  headline: string,
  subhead: string,
  accent: string,
  frameIndex: number
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
  bitmap.drawText(subhead, 16, height - 24, colors[0], {
    scale: 1,
    maxWidth: width - 32,
    lineHeight: 10,
  });
  bitmap.drawText(accent, 30, 116, colors[3], { scale: 1, maxWidth: width - 60 });
  return bitmap;
}

function tryRunFfmpeg(args: string[]): boolean {
  // Keep the optional mp4 preview from blocking provider heartbeats on slow hosts.
  const result = spawnSync('ffmpeg', args, {
    stdio: 'ignore',
    timeout: 1_500,
    killSignal: 'SIGKILL',
  });
  return result.status === 0;
}

function fallbackVideoPlan(task: ProviderTaskPackage): VideoPlan {
  const title = extractGameTitle(task);
  return {
    projectTitle: title,
    format: '12-second teaser',
    durationSec: 12,
    visualStyle: 'retro kinetic typography over chunky gameplay stills',
    musicMood: 'urgent chiptune pulse',
    scriptSummary: `Sell ${title} as a fast, readable microgame with a key, a slime, and a timer.`,
    beatSheet: [
      'Find the key before the slime closes the lane.',
      'Read the pattern, move clean, and open the exit.',
      'Boss Raid: Slime Panic. Clear the room before the clock wins.',
    ],
    compositionPlan: [
      'Open on the timer and the room layout.',
      'Cut to the slime lane and key pickup.',
      'Land on the title card and CTA.',
    ],
    renderNotes: [
      'Keep captions readable in one glance.',
      'Use the same palette as the gameplay and art pack.',
    ],
    palette: extractPalette(task, ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5']),
    launchCopy: [
      'A one-room Game Boy microgame with timer pressure.',
      'Dodge the slime. Grab the key. Hit the exit.',
    ],
  };
}

export async function buildVideoPlan(task: ProviderTaskPackage): Promise<VideoPlan> {
  const fallback = fallbackVideoPlan(task);
  const planned = await planWithVenice<VideoPlan>(
    {
      name: 'riko_video_plan',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'projectTitle',
          'format',
          'durationSec',
          'visualStyle',
          'musicMood',
          'scriptSummary',
          'beatSheet',
          'compositionPlan',
          'renderNotes',
          'palette',
          'launchCopy',
        ],
        properties: {
          projectTitle: { type: 'string' },
          format: { type: 'string' },
          durationSec: { type: 'number' },
          visualStyle: { type: 'string' },
          musicMood: { type: 'string' },
          scriptSummary: { type: 'string' },
          beatSheet: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
          compositionPlan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
          renderNotes: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
          palette: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          launchCopy: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 },
        },
      },
    },
    'You are Riko, a video marketer inside Boss Raid. Turn the request into a short teaser plan, beat sheet, and launch copy that match the supplied game brief.',
    JSON.stringify({ task: task.task, synthesis: task.synthesis }, null, 2)
  ).catch(() => undefined);
  return planned ?? fallback;
}

export function produceVideoBundle(plan: VideoPlan) {
  const builder = new ArtifactBuilder('riko');
  const palette =
    plan.palette.length >= 4 ? plan.palette : ['#0F1C2E', '#FFDA47', '#F65D5D', '#77F6C5'];
  const frames = plan.beatSheet
    .slice(0, 3)
    .map((beat, index) =>
      renderStoryFrame(
        320,
        180,
        palette,
        `${plan.projectTitle} ${index + 1}`,
        beat,
        plan.visualStyle,
        index
      )
    );
  const framePaths: string[] = [];

  frames.forEach((bitmap, index) => {
    const relativePath = joinArtifactPath(
      'video-preview',
      'frames',
      `frame-${String(index + 1).padStart(2, '0')}.png`
    );
    builder.writeBinary(relativePath, encodePng(bitmap), 'image/png');
    framePaths.push(relativePath);
  });

  const storyboard = new Bitmap(320 * 3, 180, parseHexColor(palette[0]));
  frames.forEach((frame, index) => {
    storyboard.blit(frame, index * 320, 0);
  });
  builder.writeBinary(
    joinArtifactPath('video-preview', 'storyboard.png'),
    encodePng(storyboard),
    'image/png'
  );
  builder.writeBinary(
    joinArtifactPath('video-preview', 'preview.gif'),
    encodeGifAnimation(frames, {
      delayCs: Math.max(
        60,
        Math.round((Math.max(3, plan.durationSec) * 100) / Math.max(1, frames.length))
      ),
      loopCount: 0,
    }),
    'image/gif'
  );
  builder.writeText(
    joinArtifactPath('video-preview', 'captions.srt'),
    plan.beatSheet
      .slice(0, 3)
      .map(
        (beat, index) =>
          `${index + 1}\n00:00:0${index * 2},000 --> 00:00:0${index * 2 + 2},000\n${beat}\n`
      )
      .join('\n'),
    'application/x-subrip'
  );
  builder.writeJson(joinArtifactPath('video-preview', 'plan.json'), plan);
  builder.writeText(
    joinArtifactPath('video-preview', 'remotion', 'package.json'),
    JSON.stringify(
      {
        name: normalizeName(plan.projectTitle, 'riko-remotion'),
        private: true,
        scripts: { render: 'remotion render src/index.ts Promo out/promo.mp4' },
        dependencies: {
          remotion: '^4.0.0',
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
      },
      null,
      2
    ) + '\n',
    'application/json'
  );
  builder.writeText(
    joinArtifactPath('video-preview', 'remotion', 'src', 'Promo.tsx'),
    `import React from "react";\nimport { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";\n\nconst beats = ${JSON.stringify(plan.beatSheet, null, 2)};\n\nexport const Promo: React.FC = () => {\n  const frame = useCurrentFrame();\n  return (\n    <AbsoluteFill style={{ backgroundColor: "${plan.palette[0]}", color: "${plan.palette[3]}", fontFamily: "sans-serif", justifyContent: "center", alignItems: "center" }}>\n      {beats.map((beat, index) => (\n        <Sequence key={index} from={index * 60} durationInFrames={60}>\n          <div style={{ opacity: interpolate(frame, [index * 60, index * 60 + 15], [0, 1], { extrapolateRight: "clamp" }), width: "80%", fontSize: 42, textAlign: "center" }}>{beat}</div>\n        </Sequence>\n      ))}\n    </AbsoluteFill>\n  );\n};\n`
  );
  builder.writeText(
    joinArtifactPath('video-preview', 'remotion', 'src', 'Root.tsx'),
    `import React from "react";\nimport { Composition } from "remotion";\nimport { Promo } from "./Promo";\n\nexport const RemotionRoot: React.FC = () => (\n  <Composition id="Promo" component={Promo} width={1280} height={720} fps={30} durationInFrames={${Math.max(
      90,
      plan.beatSheet.length * 60
    )}} defaultProps={{}} />\n);\n`
  );
  builder.writeText(
    joinArtifactPath('video-preview', 'remotion', 'src', 'index.ts'),
    `import { registerRoot } from "remotion";\nimport { RemotionRoot } from "./Root";\n\nregisterRoot(RemotionRoot);\n`
  );

  const frameGlob = `${builder.root}/video-preview/frames/frame-%02d.png`;
  const mp4Output = `${builder.root}/video-preview/preview.mp4`;
  if (
    tryRunFfmpeg([
      '-y',
      '-framerate',
      '1',
      '-i',
      frameGlob,
      '-vf',
      'scale=640:360:flags=neighbor,format=yuv420p',
      '-t',
      '6',
      mp4Output,
    ])
  ) {
    const mp4Buffer = spawnSync('cat', [mp4Output], { encoding: null }).stdout;
    if (mp4Buffer) {
      builder.writeBinary(joinArtifactPath('video-preview', 'preview.mp4'), mp4Buffer, 'video/mp4');
    }
  }

  builder.writeText(
    joinArtifactPath('video-preview', 'README.md'),
    `# ${plan.projectTitle}\n\n${plan.scriptSummary}\n`
  );
  return builder.inlineAll();
}

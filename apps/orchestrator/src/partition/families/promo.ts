import type { ContributionFamily } from '../types.js';

export const promoFamilies = {
  game_promo: {
    id: 'game_promo',
    workstreams: [
      {
        id: 'promo-render',
        label: 'Promo Render',
        objective: 'Produce the trailer asset or render handoff.',
        primaryType: 'video',
        artifactTypesOverride: ['video', 'text'],
        routeSpecializations: ['remotion'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'video-editor',
            label: 'Video Editor',
            objective: 'Turn the game into a trailer-ready render output.',
            prompt:
              'Produce the promo render artifact or final video handoff that best sells the requested game slice.',
          },
        ],
        childFamilyId: 'game_promo',
        expansionBias: 2.5,
      },
      {
        id: 'promo-core',
        label: 'Promo Core',
        objective: 'Define the core trailer angle and marketing hook.',
        primaryType: 'text',
        routeSpecializations: ['remotion'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'promo-strategist',
            label: 'Promo Strategist',
            objective: 'Turn the build into one sharp trailer angle with a strong CTA.',
            prompt:
              'Define the single strongest hook and launch framing for the requested game slice.',
          },
        ],
        childFamilyId: 'game_promo',
        expansionBias: 2.1,
      },
      {
        id: 'promo-script',
        label: 'Trailer Script',
        objective: 'Write the trailer script and voiceover beats.',
        primaryType: 'text',
        routeSpecializations: ['remotion'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'trailer-writer',
            label: 'Trailer Writer',
            objective: 'Write the shortest trailer script that clearly sells the game.',
            prompt: 'Write the trailer beats, captions, and CTA in the order they should land.',
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: 'promo-launch-copy',
        label: 'Launch Copy',
        objective: 'Write the short launch copy pack.',
        primaryType: 'text',
        routeSpecializations: ['remotion'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'launch-copywriter',
            label: 'Launch Copywriter',
            objective: 'Write the short social, store, and demo copy for launch.',
            prompt:
              'Produce the short copy pack Mercenary can reuse on the receipt, landing page, and demo caption.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
} satisfies Record<'game_promo', ContributionFamily>;

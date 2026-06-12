import type { ContributionFamily } from '../types.js';

export const gameFamilies = {
  game_root: {
    id: 'game_root',
    workstreams: [
      {
        id: 'gameplay',
        label: 'Gameplay',
        objective: 'Produce the playable GB Studio build.',
        primaryType: 'patch',
        routeSpecializations: ['gb-studio'],
        roles: [
          {
            id: 'gb-studio-builder',
            label: 'GB Studio Builder',
            objective: 'Build the playable GB Studio patch from the supplied brief.',
            prompt:
              'Implement the playable GB Studio scene, events, and repo edits needed for the requested game slice.',
          },
        ],
        childFamilyId: 'game_gameplay',
        expansionBias: 3.4,
      },
      {
        id: 'pixel-art',
        label: 'Pixel Art',
        objective: 'Define the pixel-art pack that the build needs.',
        primaryType: 'image',
        artifactTypesOverride: ['image', 'text', 'bundle'],
        routeSpecializations: ['pixel-art'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'pixel-artist',
            label: 'Pixel Artist',
            objective: 'Turn the game brief into a concrete pixel-art asset plan.',
            prompt:
              'Produce a pixel-art brief with palette, sprite list, tile plan, canvas sizes, and animation notes that fit the requested game slice.',
          },
        ],
        childFamilyId: 'game_art',
        expansionBias: 1.9,
      },
      {
        id: 'video-marketing',
        label: 'Video Marketing',
        objective: 'Turn the build into a trailer and launch angle.',
        primaryType: 'video',
        artifactTypesOverride: ['video', 'text'],
        routeSpecializations: ['remotion'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'video-marketer',
            label: 'Video Marketer',
            objective: 'Turn the build into a marketable trailer concept and launch package.',
            prompt:
              'Produce the trailer hook, shot list, CTA, and launch copy that best sells the requested game slice.',
          },
        ],
        childFamilyId: 'game_promo',
        expansionBias: 1.6,
      },
    ],
  },
  game_gameplay: {
    id: 'game_gameplay',
    workstreams: [
      {
        id: 'gameplay-core',
        label: 'Gameplay Core',
        objective: 'Produce the main GB Studio patch.',
        primaryType: 'patch',
        routeSpecializations: ['gb-studio'],
        roles: [
          {
            id: 'gameplay-builder',
            label: 'Gameplay Builder',
            objective: 'Implement the main playable loop in GB Studio.',
            prompt:
              'Write the core GB Studio repo changes that make the requested game slice playable end to end.',
          },
        ],
        childFamilyId: 'game_gameplay',
        expansionBias: 2.9,
      },
      {
        id: 'gameplay-qa',
        label: 'Gameplay QA',
        objective: 'Find broken loops, blocked interactions, and missing validation.',
        primaryType: 'text',
        routeSpecializations: ['gb-studio'],
        roles: [
          {
            id: 'gameplay-qa',
            label: 'Gameplay QA',
            objective:
              'Pressure test the build for blocked progress, missing hooks, and brittle logic.',
            prompt:
              'Assume another provider builds the game. Focus on dead ends, missing triggers, scene transitions, and validation steps.',
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: 'gameplay-scope',
        label: 'Gameplay Scope',
        objective: 'Lock the smallest safe gameplay scope.',
        primaryType: 'text',
        routeSpecializations: ['gb-studio'],
        roles: [
          {
            id: 'mechanic-scope',
            label: 'Mechanic Scope',
            objective:
              'Constrain the mechanic, scene, and interaction scope to what can ship cleanly.',
            prompt:
              'State the smallest complete gameplay slice Mercenary should preserve in the final build.',
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: 'gameplay-handoff',
        label: 'Gameplay Handoff',
        objective: 'Turn the gameplay build into a clean asset and scene handoff.',
        primaryType: 'text',
        routeSpecializations: ['gb-studio'],
        roles: [
          {
            id: 'asset-handoff',
            label: 'Asset Handoff',
            objective:
              'State the exact asset, scene, and event contracts the rest of the build depends on.',
            prompt:
              'List the exact asset hooks, scene names, and event expectations the final build needs.',
          },
        ],
        expansionBias: 1.1,
      },
    ],
  },
  game_art: {
    id: 'game_art',
    workstreams: [
      {
        id: 'art-direction',
        label: 'Art Direction',
        objective: 'Lock the art direction for the requested game slice.',
        primaryType: 'text',
        routeSpecializations: ['pixel-art'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'art-director',
            label: 'Art Director',
            objective:
              'Set the palette, mood, silhouette, and visual constraints for the game slice.',
            prompt:
              'Define the visual direction so the build reads coherently in a Game Boy-scale frame.',
          },
        ],
        childFamilyId: 'game_art',
        expansionBias: 2.4,
      },
      {
        id: 'art-assets',
        label: 'Asset Pack',
        objective: 'List the concrete sprites, tiles, and UI parts the build needs.',
        primaryType: 'image',
        artifactTypesOverride: ['image', 'text', 'bundle'],
        routeSpecializations: ['pixel-art'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'sprite-planner',
            label: 'Sprite Planner',
            objective: 'Turn the art direction into a concrete sprite and tile checklist.',
            prompt: 'List the concrete asset pack with canvas sizes, counts, and reuse rules.',
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: 'art-animation',
        label: 'Animation Notes',
        objective: 'Define animation beats and motion constraints.',
        primaryType: 'text',
        routeSpecializations: ['pixel-art'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'animation-planner',
            label: 'Animation Planner',
            objective:
              'Describe animation frames, loops, and motion cues that fit the asset budget.',
            prompt:
              'Specify the minimal animation beats that make the scene feel alive without widening scope.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'art-handoff',
        label: 'Art Handoff',
        objective: 'Turn the art plan into a clean builder handoff.',
        primaryType: 'text',
        routeSpecializations: ['pixel-art'],
        frameworkOverride: null,
        languageOverride: 'text',
        roles: [
          {
            id: 'art-handoff',
            label: 'Art Handoff',
            objective:
              'Package the asset plan into the shortest handoff the builder can execute against.',
            prompt:
              'Present the asset brief as a clean build handoff with no missing dimensions or naming ambiguity.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
} satisfies Record<'game_root' | 'game_gameplay' | 'game_art', ContributionFamily>;

import type { ContributionFamily, ContributionFamilyId } from './types.js';

export const FAMILIES: Record<ContributionFamilyId, ContributionFamily> = {
  patch_root: {
    id: 'patch_root',
    workstreams: [
      {
        id: 'diagnosis',
        label: 'Diagnosis',
        objective: 'Explain what is broken and why.',
        primaryType: 'text',
        roles: [
          {
            id: 'root-cause',
            label: 'Root Cause',
            objective: 'Isolate the defect and explain exactly why it fails.',
            prompt: 'Focus on the failing logic and the smallest proof of the bug.',
          },
        ],
        childFamilyId: 'patch_diagnosis',
        expansionBias: 1.7,
      },
      {
        id: 'implementation',
        label: 'Implementation',
        objective: 'Produce the concrete fix that Mercenary can ship.',
        primaryType: 'patch',
        roles: [
          {
            id: 'patch-author',
            label: 'Patch Author',
            objective: 'Produce the safest concrete fix from the supplied context.',
            prompt: 'Write the minimal patch that fixes the bug without widening scope.',
          },
        ],
        childFamilyId: 'patch_implementation',
        expansionBias: 3.2,
      },
      {
        id: 'verification',
        label: 'Verification',
        objective: 'Stress test the likely fix for regressions and missing guards.',
        primaryType: 'text',
        roles: [
          {
            id: 'regression-review',
            label: 'Regression Review',
            objective:
              'Pressure test the likely fix for regressions, missing guards, and side effects.',
            prompt:
              'Assume another provider will write the patch. Focus on regressions, edge cases, and scope control.',
          },
        ],
        childFamilyId: 'patch_verification',
        expansionBias: 2.1,
      },
      {
        id: 'delivery',
        label: 'Delivery',
        objective: 'Turn the fix into a short rollout and validation note.',
        primaryType: 'text',
        roles: [
          {
            id: 'change-explainer',
            label: 'Change Explainer',
            objective: 'Turn the fix into a short rollout note with confidence limits.',
            prompt:
              'Focus on why the fix is safe, what still looks uncertain, and how to validate it.',
          },
        ],
        expansionBias: 0.8,
      },
    ],
  },
  patch_diagnosis: {
    id: 'patch_diagnosis',
    workstreams: [
      {
        id: 'diagnosis-core',
        label: 'Diagnosis Core',
        objective: 'Pin down the smallest valid explanation of the bug.',
        primaryType: 'text',
        roles: [
          {
            id: 'root-cause',
            label: 'Root Cause',
            objective: 'Pin down the main defect in the supplied context.',
            prompt: 'State the exact failing behavior and tie it to the narrowest broken logic.',
          },
        ],
        childFamilyId: 'patch_diagnosis',
        expansionBias: 2.7,
      },
      {
        id: 'diagnosis-repro',
        label: 'Diagnosis Repro',
        objective: 'Reduce the bug to a short reproducible path.',
        primaryType: 'text',
        roles: [
          {
            id: 'repro-reduction',
            label: 'Repro Reduction',
            objective: 'Reduce the bug to the shortest reproducible sequence.',
            prompt: 'Describe the shortest concrete repro path that proves the bug.',
          },
          {
            id: 'failure-trace',
            label: 'Failure Trace',
            objective: 'Describe where the failure becomes visible to the caller.',
            prompt: 'Call out the state transition or code path where the bug becomes visible.',
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: 'diagnosis-surface',
        label: 'Diagnosis Surface',
        objective: 'Map the files and boundaries that the bug touches.',
        primaryType: 'text',
        roles: [
          {
            id: 'surface-mapping',
            label: 'Surface Mapping',
            objective: 'Map the files, modules, or interfaces that matter to the defect.',
            prompt: 'List the narrowest code surface that Mercenary should care about.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'diagnosis-constraints',
        label: 'Diagnosis Constraints',
        objective: 'Expose uncertainty, missing context, and risky assumptions.',
        primaryType: 'text',
        roles: [
          {
            id: 'constraint-check',
            label: 'Constraint Check',
            objective: 'Find what is missing or under-specified in the diagnosis.',
            prompt:
              'Call out missing context, ambiguity, or unsupported assumptions in the diagnosis.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  patch_implementation: {
    id: 'patch_implementation',
    workstreams: [
      {
        id: 'implementation-core',
        label: 'Implementation Core',
        objective: 'Produce the main implementation diff.',
        primaryType: 'patch',
        roles: [
          {
            id: 'patch-author',
            label: 'Patch Author',
            objective: 'Write the main patch with the fewest necessary edits.',
            prompt: 'Write the minimal patch that resolves the defect cleanly.',
          },
        ],
        childFamilyId: 'patch_implementation',
        expansionBias: 3.1,
      },
      {
        id: 'implementation-safety',
        label: 'Implementation Safety',
        objective: 'Stress test the implementation for safety and scope control.',
        primaryType: 'text',
        roles: [
          {
            id: 'patch-safety',
            label: 'Patch Safety',
            objective: 'Find unsafe edits, brittle assumptions, and rollback risks.',
            prompt:
              'Review the likely patch shape for unsafe scope changes and brittle assumptions.',
          },
          {
            id: 'side-effect-scan',
            label: 'Side Effect Scan',
            objective: 'Look for hidden behavior changes the patch could trigger.',
            prompt:
              'Focus on side effects, hidden callers, and state transitions the patch might disturb.',
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: 'implementation-merge',
        label: 'Implementation Merge',
        objective: 'Reduce merge friction around the implementation.',
        primaryType: 'text',
        roles: [
          {
            id: 'patch-merge',
            label: 'Patch Merge',
            objective: 'Identify merge friction and simplify the diff shape.',
            prompt:
              'Look for ways to make the implementation easier to merge and reconcile with adjacent changes.',
          },
          {
            id: 'diff-shape',
            label: 'Diff Shape',
            objective: 'Reduce diff churn and isolate the smallest safe change boundary.',
            prompt: 'Call out how to keep the final diff compact and easy to review.',
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: 'implementation-validation',
        label: 'Implementation Validation',
        objective: 'Turn the implementation into a concise validation path.',
        primaryType: 'text',
        roles: [
          {
            id: 'patch-validation',
            label: 'Patch Validation',
            objective: 'Define the shortest validation path for the final patch.',
            prompt:
              'State the concrete checks Mercenary should run before accepting the implementation.',
          },
          {
            id: 'acceptance-checks',
            label: 'Acceptance Checks',
            objective: 'Turn the patch into a concrete accept-or-reject checklist.',
            prompt: 'List the shortest objective checks that prove the patch is acceptable.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'implementation-fallback',
        label: 'Implementation Fallback',
        objective: 'Preserve rollback and fallback options for the patch.',
        primaryType: 'text',
        roles: [
          {
            id: 'rollback-plan',
            label: 'Rollback Plan',
            objective: 'State how Mercenary should back out the patch if it misbehaves.',
            prompt: 'Describe the cleanest rollback or fallback posture for the final patch.',
          },
        ],
        expansionBias: 0.9,
      },
    ],
  },
  patch_verification: {
    id: 'patch_verification',
    workstreams: [
      {
        id: 'verification-core',
        label: 'Verification Core',
        objective: 'Find the most likely ways the patch could still fail.',
        primaryType: 'text',
        roles: [
          {
            id: 'regression-review',
            label: 'Regression Review',
            objective: 'Pressure test the likely fix for regressions and missing guards.',
            prompt:
              'Assume another provider wrote the patch. Focus on regressions, edge cases, and scope control.',
          },
        ],
        childFamilyId: 'patch_verification',
        expansionBias: 2.8,
      },
      {
        id: 'verification-edge-cases',
        label: 'Verification Edge Cases',
        objective: 'Hunt for edge cases and non-obvious input combinations.',
        primaryType: 'text',
        roles: [
          {
            id: 'edge-case-hunter',
            label: 'Edge Case Hunter',
            objective: 'Find the nastiest remaining edge cases around the patch.',
            prompt:
              'List concrete edge cases or boundary conditions that could still fail after the patch.',
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: 'verification-contracts',
        label: 'Verification Contracts',
        objective: 'Check that the patch still matches surrounding interfaces and expectations.',
        primaryType: 'text',
        roles: [
          {
            id: 'contract-check',
            label: 'Contract Check',
            objective: 'Check that the patch still matches component, API, or state contracts.',
            prompt:
              'Look for interfaces, invariants, or hidden assumptions the patch could violate.',
          },
        ],
        expansionBias: 1.3,
      },
      {
        id: 'verification-runtime',
        label: 'Verification Runtime',
        objective: 'Define the shortest runtime or test path for confidence.',
        primaryType: 'text',
        roles: [
          {
            id: 'runtime-checks',
            label: 'Runtime Checks',
            objective: 'Turn the patch into concrete runtime probes or tests.',
            prompt: 'Describe the most efficient runtime or test checks to validate the patch.',
          },
        ],
        expansionBias: 1.1,
      },
    ],
  },
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
  text_root: {
    id: 'text_root',
    workstreams: [
      {
        id: 'answer',
        label: 'Answer',
        objective: 'Produce the direct synthesized answer.',
        primaryType: 'text',
        roles: [
          {
            id: 'lead-answer',
            label: 'Lead Answer',
            objective: 'Produce the clearest direct answer from the supplied evidence.',
            prompt: 'Give the main answer directly and keep it grounded in the provided context.',
          },
        ],
        childFamilyId: 'text_answer',
        expansionBias: 3,
      },
      {
        id: 'risk',
        label: 'Risk',
        objective: 'Find edge cases, caveats, and failure modes.',
        primaryType: 'text',
        roles: [
          {
            id: 'risk-review',
            label: 'Risk Review',
            objective: 'Add edge cases, caveats, and failure modes the lead answer could miss.',
            prompt:
              'Assume another provider gives the main answer. Focus on caveats, counterexamples, and sharp edges.',
          },
        ],
        childFamilyId: 'text_risk',
        expansionBias: 1.8,
      },
      {
        id: 'constraints',
        label: 'Constraints',
        objective: 'Find missing context, unsupported assumptions, and hard limits.',
        primaryType: 'text',
        roles: [
          {
            id: 'constraint-check',
            label: 'Constraint Check',
            objective:
              'Check the answer against stated limits, missing context, and unsupported assumptions.',
            prompt:
              'Look for where the task is under-scoped, ambiguous, or likely to tempt an unsupported claim.',
          },
        ],
        childFamilyId: 'text_constraints',
        expansionBias: 1.5,
      },
      {
        id: 'execution',
        label: 'Execution',
        objective: 'Turn the result into a short next-step plan.',
        primaryType: 'text',
        roles: [
          {
            id: 'action-plan',
            label: 'Action Plan',
            objective: 'Turn the result into a short next-step recommendation.',
            prompt: 'Focus on what the caller should do next, with concrete and low-risk steps.',
          },
        ],
        childFamilyId: 'text_execution',
        expansionBias: 1.1,
      },
    ],
  },
  text_answer: {
    id: 'text_answer',
    workstreams: [
      {
        id: 'answer-core',
        label: 'Answer Core',
        objective: 'Produce the main answer body.',
        primaryType: 'text',
        roles: [
          {
            id: 'lead-answer',
            label: 'Lead Answer',
            objective: 'State the direct answer with the highest confidence.',
            prompt: 'State the answer directly and keep it grounded in the supplied context.',
          },
        ],
        childFamilyId: 'text_answer',
        expansionBias: 2.9,
      },
      {
        id: 'answer-evidence',
        label: 'Answer Evidence',
        objective: 'Provide the strongest support for the answer.',
        primaryType: 'text',
        roles: [
          {
            id: 'evidence-review',
            label: 'Evidence Review',
            objective: 'Pull the strongest rationale that supports the answer.',
            prompt: 'Support the answer with the strongest rationale from the supplied context.',
          },
          {
            id: 'cross-check',
            label: 'Cross Check',
            objective: 'Look for evidence that either confirms or weakens the answer.',
            prompt: 'Cross-check the main answer against competing interpretations in the prompt.',
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: 'answer-clarity',
        label: 'Answer Clarity',
        objective: 'Tighten the answer for readability and precision.',
        primaryType: 'text',
        roles: [
          {
            id: 'clarity-pass',
            label: 'Clarity Pass',
            objective: 'Rewrite the answer into shorter, clearer language.',
            prompt:
              'Rewrite the answer into concise, direct language without dropping important meaning.',
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: 'answer-limits',
        label: 'Answer Limits',
        objective: 'Expose limits and unsupported assumptions in the answer.',
        primaryType: 'text',
        roles: [
          {
            id: 'limit-check',
            label: 'Limit Check',
            objective: 'Find where the answer could overreach or understate uncertainty.',
            prompt:
              'Call out where the answer could overreach or where the provided context runs out.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'answer-alternatives',
        label: 'Answer Alternatives',
        objective: 'Offer competing framings or interpretations worth comparing.',
        primaryType: 'text',
        roles: [
          {
            id: 'alternative-framing',
            label: 'Alternative Framing',
            objective: 'Offer the next best framing or interpretation of the answer.',
            prompt:
              'State the strongest alternative framing Mercenary should compare before finalizing the answer.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  text_constraints: {
    id: 'text_constraints',
    workstreams: [
      {
        id: 'constraints-core',
        label: 'Constraints Core',
        objective: 'Find the strongest missing-context or unsupported-claim risk.',
        primaryType: 'text',
        roles: [
          {
            id: 'constraint-check',
            label: 'Constraint Check',
            objective: 'Check the answer against missing context and unsupported assumptions.',
            prompt: 'Find where the answer is under-scoped, ambiguous, or unsupported.',
          },
        ],
        childFamilyId: 'text_constraints',
        expansionBias: 2.6,
      },
      {
        id: 'constraints-boundaries',
        label: 'Constraints Boundaries',
        objective: 'Identify hard boundaries around what the answer can claim.',
        primaryType: 'text',
        roles: [
          {
            id: 'boundary-check',
            label: 'Boundary Check',
            objective: 'Identify the exact boundaries around the answer.',
            prompt: 'State where the answer clearly stops being supported by the prompt.',
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: 'constraints-dependencies',
        label: 'Constraints Dependencies',
        objective: 'Identify external dependencies or hidden preconditions.',
        primaryType: 'text',
        roles: [
          {
            id: 'dependency-check',
            label: 'Dependency Check',
            objective: 'Look for dependencies or preconditions the answer assumes.',
            prompt:
              'List hidden dependencies, unstated prerequisites, or implied conditions behind the answer.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'constraints-ambiguity',
        label: 'Constraints Ambiguity',
        objective: 'Expose ambiguous wording and interpretation risk.',
        primaryType: 'text',
        roles: [
          {
            id: 'ambiguity-check',
            label: 'Ambiguity Check',
            objective: 'Expose ambiguous wording that could change the answer.',
            prompt: 'Call out ambiguous phrases or unresolved interpretations in the task.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  text_risk: {
    id: 'text_risk',
    workstreams: [
      {
        id: 'risk-core',
        label: 'Risk Core',
        objective: 'Find the most important caveats and failure modes.',
        primaryType: 'text',
        roles: [
          {
            id: 'risk-review',
            label: 'Risk Review',
            objective: 'Add the strongest caveats and failure modes to the answer.',
            prompt:
              'Find the caveats, counterexamples, and sharp edges the main answer could miss.',
          },
        ],
        childFamilyId: 'text_risk',
        expansionBias: 2.5,
      },
      {
        id: 'risk-counterexamples',
        label: 'Risk Counterexamples',
        objective: 'Find concrete counterexamples that could weaken the answer.',
        primaryType: 'text',
        roles: [
          {
            id: 'counterexample-hunt',
            label: 'Counterexample Hunt',
            objective: 'Find concrete situations where the main answer could break down.',
            prompt: 'State the strongest counterexamples or failure cases against the main answer.',
          },
        ],
        expansionBias: 1.6,
      },
      {
        id: 'risk-abuse',
        label: 'Risk Abuse',
        objective: 'Look for misuse, abuse, or dangerous follow-on actions.',
        primaryType: 'text',
        roles: [
          {
            id: 'abuse-case-review',
            label: 'Abuse Case Review',
            objective: 'Look for unsafe or misleading ways the answer could be applied.',
            prompt:
              'State how a caller could misuse the answer or draw unsafe conclusions from it.',
          },
        ],
        expansionBias: 1.1,
      },
      {
        id: 'risk-uncertainty',
        label: 'Risk Uncertainty',
        objective: 'Explain what remains unknown after synthesis.',
        primaryType: 'text',
        roles: [
          {
            id: 'uncertainty-note',
            label: 'Uncertainty Note',
            objective: 'Capture the main unresolved uncertainties after review.',
            prompt: 'State the biggest unknowns Mercenary should preserve in the final answer.',
          },
        ],
        expansionBias: 0.9,
      },
    ],
  },
  text_execution: {
    id: 'text_execution',
    workstreams: [
      {
        id: 'execution-core',
        label: 'Execution Core',
        objective: 'Turn the answer into the best immediate next-step plan.',
        primaryType: 'text',
        roles: [
          {
            id: 'action-plan',
            label: 'Action Plan',
            objective: 'Turn the result into a short next-step recommendation.',
            prompt: 'Focus on what the caller should do next, with concrete and low-risk steps.',
          },
        ],
        childFamilyId: 'text_execution',
        expansionBias: 2.4,
      },
      {
        id: 'execution-validation',
        label: 'Execution Validation',
        objective: 'State how the caller should validate the next step.',
        primaryType: 'text',
        roles: [
          {
            id: 'validation-plan',
            label: 'Validation Plan',
            objective: 'Describe how the caller should validate the chosen action.',
            prompt: 'State the shortest validation path for the recommended next step.',
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: 'execution-ordering',
        label: 'Execution Ordering',
        objective: 'Order the next steps to reduce risk and rework.',
        primaryType: 'text',
        roles: [
          {
            id: 'step-ordering',
            label: 'Step Ordering',
            objective: 'Order the next steps to keep risk and rework low.',
            prompt: 'State the safest order in which the caller should execute the next steps.',
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: 'execution-fallback',
        label: 'Execution Fallback',
        objective: 'Preserve fallback options if the first action fails.',
        primaryType: 'text',
        roles: [
          {
            id: 'fallback-plan',
            label: 'Fallback Plan',
            objective: 'Preserve the safest fallback if the first action fails.',
            prompt:
              'Describe what the caller should do if the first recommended action does not work.',
          },
        ],
        expansionBias: 1,
      },
    ],
  },
};

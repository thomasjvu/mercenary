import { basename } from "node:path";
import type { OutputType, SanitizedTaskSpec } from "@bossraid/shared-types";

type ContributionRoleTemplate = {
  id: string;
  label: string;
  objective: string;
  prompt: string;
};

export type ContributionRolePlan = {
  id: string;
  label: string;
  objective: string;
  prompt: string;
  workstreamId: string;
  workstreamLabel: string;
  workstreamObjective: string;
};

export type ContributionFamilyId =
  | "patch_root"
  | "patch_diagnosis"
  | "patch_implementation"
  | "patch_verification"
  | "game_root"
  | "game_gameplay"
  | "game_art"
  | "game_promo"
  | "text_root"
  | "text_answer"
  | "text_constraints"
  | "text_risk"
  | "text_execution";

export type ContributionWorkstreamTemplate = {
  id: string;
  label: string;
  objective: string;
  primaryType: OutputType;
  artifactTypesOverride?: OutputType[];
  routeSpecializations?: string[];
  frameworkOverride?: string | null;
  languageOverride?: SanitizedTaskSpec["language"];
  roles: ContributionRoleTemplate[];
  childFamilyId?: ContributionFamilyId;
  expansionBias: number;
};

type ContributionFamily = {
  id: ContributionFamilyId;
  workstreams: ContributionWorkstreamTemplate[];
};

export type ContributionWorkstreamAllocation = {
  template: ContributionWorkstreamTemplate;
  assignedExperts: number;
};

type TaskPlanningContext = {
  focusLabel: string;
  surfacePhrase: string;
  signalLabel?: string;
};

const FAMILIES: Record<ContributionFamilyId, ContributionFamily> = {
  patch_root: {
    id: "patch_root",
    workstreams: [
      {
        id: "diagnosis",
        label: "Diagnosis",
        objective: "Explain what is broken and why.",
        primaryType: "text",
        roles: [
          {
            id: "root-cause",
            label: "Root Cause",
            objective: "Isolate the defect and explain exactly why it fails.",
            prompt: "Focus on the failing logic and the smallest proof of the bug.",
          },
        ],
        childFamilyId: "patch_diagnosis",
        expansionBias: 1.7,
      },
      {
        id: "implementation",
        label: "Implementation",
        objective: "Produce the concrete fix that Mercenary can ship.",
        primaryType: "patch",
        roles: [
          {
            id: "patch-author",
            label: "Patch Author",
            objective: "Produce the safest concrete fix from the supplied context.",
            prompt: "Write the minimal patch that fixes the bug without widening scope.",
          },
        ],
        childFamilyId: "patch_implementation",
        expansionBias: 3.2,
      },
      {
        id: "verification",
        label: "Verification",
        objective: "Stress test the likely fix for regressions and missing guards.",
        primaryType: "text",
        roles: [
          {
            id: "regression-review",
            label: "Regression Review",
            objective: "Pressure test the likely fix for regressions, missing guards, and side effects.",
            prompt: "Assume another provider will write the patch. Focus on regressions, edge cases, and scope control.",
          },
        ],
        childFamilyId: "patch_verification",
        expansionBias: 2.1,
      },
      {
        id: "delivery",
        label: "Delivery",
        objective: "Turn the fix into a short rollout and validation note.",
        primaryType: "text",
        roles: [
          {
            id: "change-explainer",
            label: "Change Explainer",
            objective: "Turn the fix into a short rollout note with confidence limits.",
            prompt: "Focus on why the fix is safe, what still looks uncertain, and how to validate it.",
          },
        ],
        expansionBias: 0.8,
      },
    ],
  },
  patch_diagnosis: {
    id: "patch_diagnosis",
    workstreams: [
      {
        id: "diagnosis-core",
        label: "Diagnosis Core",
        objective: "Pin down the smallest valid explanation of the bug.",
        primaryType: "text",
        roles: [
          {
            id: "root-cause",
            label: "Root Cause",
            objective: "Pin down the main defect in the supplied context.",
            prompt: "State the exact failing behavior and tie it to the narrowest broken logic.",
          },
        ],
        childFamilyId: "patch_diagnosis",
        expansionBias: 2.7,
      },
      {
        id: "diagnosis-repro",
        label: "Diagnosis Repro",
        objective: "Reduce the bug to a short reproducible path.",
        primaryType: "text",
        roles: [
          {
            id: "repro-reduction",
            label: "Repro Reduction",
            objective: "Reduce the bug to the shortest reproducible sequence.",
            prompt: "Describe the shortest concrete repro path that proves the bug.",
          },
          {
            id: "failure-trace",
            label: "Failure Trace",
            objective: "Describe where the failure becomes visible to the caller.",
            prompt: "Call out the state transition or code path where the bug becomes visible.",
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: "diagnosis-surface",
        label: "Diagnosis Surface",
        objective: "Map the files and boundaries that the bug touches.",
        primaryType: "text",
        roles: [
          {
            id: "surface-mapping",
            label: "Surface Mapping",
            objective: "Map the files, modules, or interfaces that matter to the defect.",
            prompt: "List the narrowest code surface that Mercenary should care about.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "diagnosis-constraints",
        label: "Diagnosis Constraints",
        objective: "Expose uncertainty, missing context, and risky assumptions.",
        primaryType: "text",
        roles: [
          {
            id: "constraint-check",
            label: "Constraint Check",
            objective: "Find what is missing or under-specified in the diagnosis.",
            prompt: "Call out missing context, ambiguity, or unsupported assumptions in the diagnosis.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  patch_implementation: {
    id: "patch_implementation",
    workstreams: [
      {
        id: "implementation-core",
        label: "Implementation Core",
        objective: "Produce the main implementation diff.",
        primaryType: "patch",
        roles: [
          {
            id: "patch-author",
            label: "Patch Author",
            objective: "Write the main patch with the fewest necessary edits.",
            prompt: "Write the minimal patch that resolves the defect cleanly.",
          },
        ],
        childFamilyId: "patch_implementation",
        expansionBias: 3.1,
      },
      {
        id: "implementation-safety",
        label: "Implementation Safety",
        objective: "Stress test the implementation for safety and scope control.",
        primaryType: "text",
        roles: [
          {
            id: "patch-safety",
            label: "Patch Safety",
            objective: "Find unsafe edits, brittle assumptions, and rollback risks.",
            prompt: "Review the likely patch shape for unsafe scope changes and brittle assumptions.",
          },
          {
            id: "side-effect-scan",
            label: "Side Effect Scan",
            objective: "Look for hidden behavior changes the patch could trigger.",
            prompt: "Focus on side effects, hidden callers, and state transitions the patch might disturb.",
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: "implementation-merge",
        label: "Implementation Merge",
        objective: "Reduce merge friction around the implementation.",
        primaryType: "text",
        roles: [
          {
            id: "patch-merge",
            label: "Patch Merge",
            objective: "Identify merge friction and simplify the diff shape.",
            prompt: "Look for ways to make the implementation easier to merge and reconcile with adjacent changes.",
          },
          {
            id: "diff-shape",
            label: "Diff Shape",
            objective: "Reduce diff churn and isolate the smallest safe change boundary.",
            prompt: "Call out how to keep the final diff compact and easy to review.",
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: "implementation-validation",
        label: "Implementation Validation",
        objective: "Turn the implementation into a concise validation path.",
        primaryType: "text",
        roles: [
          {
            id: "patch-validation",
            label: "Patch Validation",
            objective: "Define the shortest validation path for the final patch.",
            prompt: "State the concrete checks Mercenary should run before accepting the implementation.",
          },
          {
            id: "acceptance-checks",
            label: "Acceptance Checks",
            objective: "Turn the patch into a concrete accept-or-reject checklist.",
            prompt: "List the shortest objective checks that prove the patch is acceptable.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "implementation-fallback",
        label: "Implementation Fallback",
        objective: "Preserve rollback and fallback options for the patch.",
        primaryType: "text",
        roles: [
          {
            id: "rollback-plan",
            label: "Rollback Plan",
            objective: "State how Mercenary should back out the patch if it misbehaves.",
            prompt: "Describe the cleanest rollback or fallback posture for the final patch.",
          },
        ],
        expansionBias: 0.9,
      },
    ],
  },
  patch_verification: {
    id: "patch_verification",
    workstreams: [
      {
        id: "verification-core",
        label: "Verification Core",
        objective: "Find the most likely ways the patch could still fail.",
        primaryType: "text",
        roles: [
          {
            id: "regression-review",
            label: "Regression Review",
            objective: "Pressure test the likely fix for regressions and missing guards.",
            prompt: "Assume another provider wrote the patch. Focus on regressions, edge cases, and scope control.",
          },
        ],
        childFamilyId: "patch_verification",
        expansionBias: 2.8,
      },
      {
        id: "verification-edge-cases",
        label: "Verification Edge Cases",
        objective: "Hunt for edge cases and non-obvious input combinations.",
        primaryType: "text",
        roles: [
          {
            id: "edge-case-hunter",
            label: "Edge Case Hunter",
            objective: "Find the nastiest remaining edge cases around the patch.",
            prompt: "List concrete edge cases or boundary conditions that could still fail after the patch.",
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: "verification-contracts",
        label: "Verification Contracts",
        objective: "Check that the patch still matches surrounding interfaces and expectations.",
        primaryType: "text",
        roles: [
          {
            id: "contract-check",
            label: "Contract Check",
            objective: "Check that the patch still matches component, API, or state contracts.",
            prompt: "Look for interfaces, invariants, or hidden assumptions the patch could violate.",
          },
        ],
        expansionBias: 1.3,
      },
      {
        id: "verification-runtime",
        label: "Verification Runtime",
        objective: "Define the shortest runtime or test path for confidence.",
        primaryType: "text",
        roles: [
          {
            id: "runtime-checks",
            label: "Runtime Checks",
            objective: "Turn the patch into concrete runtime probes or tests.",
            prompt: "Describe the most efficient runtime or test checks to validate the patch.",
          },
        ],
        expansionBias: 1.1,
      },
    ],
  },
  game_root: {
    id: "game_root",
    workstreams: [
      {
        id: "gameplay",
        label: "Gameplay",
        objective: "Produce the playable GB Studio build.",
        primaryType: "patch",
        routeSpecializations: ["gb-studio"],
        roles: [
          {
            id: "gb-studio-builder",
            label: "GB Studio Builder",
            objective: "Build the playable GB Studio patch from the supplied brief.",
            prompt: "Implement the playable GB Studio scene, events, and repo edits needed for the requested game slice.",
          },
        ],
        childFamilyId: "game_gameplay",
        expansionBias: 3.4,
      },
      {
        id: "pixel-art",
        label: "Pixel Art",
        objective: "Define the pixel-art pack that the build needs.",
        primaryType: "image",
        artifactTypesOverride: ["image", "text", "bundle"],
        routeSpecializations: ["pixel-art"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "pixel-artist",
            label: "Pixel Artist",
            objective: "Turn the game brief into a concrete pixel-art asset plan.",
            prompt: "Produce a pixel-art brief with palette, sprite list, tile plan, canvas sizes, and animation notes that fit the requested game slice.",
          },
        ],
        childFamilyId: "game_art",
        expansionBias: 1.9,
      },
      {
        id: "video-marketing",
        label: "Video Marketing",
        objective: "Turn the build into a trailer and launch angle.",
        primaryType: "video",
        artifactTypesOverride: ["video", "text"],
        routeSpecializations: ["remotion"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "video-marketer",
            label: "Video Marketer",
            objective: "Turn the build into a marketable trailer concept and launch package.",
            prompt: "Produce the trailer hook, shot list, CTA, and launch copy that best sells the requested game slice.",
          },
        ],
        childFamilyId: "game_promo",
        expansionBias: 1.6,
      },
    ],
  },
  game_gameplay: {
    id: "game_gameplay",
    workstreams: [
      {
        id: "gameplay-core",
        label: "Gameplay Core",
        objective: "Produce the main GB Studio patch.",
        primaryType: "patch",
        routeSpecializations: ["gb-studio"],
        roles: [
          {
            id: "gameplay-builder",
            label: "Gameplay Builder",
            objective: "Implement the main playable loop in GB Studio.",
            prompt: "Write the core GB Studio repo changes that make the requested game slice playable end to end.",
          },
        ],
        childFamilyId: "game_gameplay",
        expansionBias: 2.9,
      },
      {
        id: "gameplay-qa",
        label: "Gameplay QA",
        objective: "Find broken loops, blocked interactions, and missing validation.",
        primaryType: "text",
        routeSpecializations: ["gb-studio"],
        roles: [
          {
            id: "gameplay-qa",
            label: "Gameplay QA",
            objective: "Pressure test the build for blocked progress, missing hooks, and brittle logic.",
            prompt: "Assume another provider builds the game. Focus on dead ends, missing triggers, scene transitions, and validation steps.",
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: "gameplay-scope",
        label: "Gameplay Scope",
        objective: "Lock the smallest safe gameplay scope.",
        primaryType: "text",
        routeSpecializations: ["gb-studio"],
        roles: [
          {
            id: "mechanic-scope",
            label: "Mechanic Scope",
            objective: "Constrain the mechanic, scene, and interaction scope to what can ship cleanly.",
            prompt: "State the smallest complete gameplay slice Mercenary should preserve in the final build.",
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: "gameplay-handoff",
        label: "Gameplay Handoff",
        objective: "Turn the gameplay build into a clean asset and scene handoff.",
        primaryType: "text",
        routeSpecializations: ["gb-studio"],
        roles: [
          {
            id: "asset-handoff",
            label: "Asset Handoff",
            objective: "State the exact asset, scene, and event contracts the rest of the build depends on.",
            prompt: "List the exact asset hooks, scene names, and event expectations the final build needs.",
          },
        ],
        expansionBias: 1.1,
      },
    ],
  },
  game_art: {
    id: "game_art",
    workstreams: [
      {
        id: "art-direction",
        label: "Art Direction",
        objective: "Lock the art direction for the requested game slice.",
        primaryType: "text",
        routeSpecializations: ["pixel-art"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "art-director",
            label: "Art Director",
            objective: "Set the palette, mood, silhouette, and visual constraints for the game slice.",
            prompt: "Define the visual direction so the build reads coherently in a Game Boy-scale frame.",
          },
        ],
        childFamilyId: "game_art",
        expansionBias: 2.4,
      },
      {
        id: "art-assets",
        label: "Asset Pack",
        objective: "List the concrete sprites, tiles, and UI parts the build needs.",
        primaryType: "image",
        artifactTypesOverride: ["image", "text", "bundle"],
        routeSpecializations: ["pixel-art"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "sprite-planner",
            label: "Sprite Planner",
            objective: "Turn the art direction into a concrete sprite and tile checklist.",
            prompt: "List the concrete asset pack with canvas sizes, counts, and reuse rules.",
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: "art-animation",
        label: "Animation Notes",
        objective: "Define animation beats and motion constraints.",
        primaryType: "text",
        routeSpecializations: ["pixel-art"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "animation-planner",
            label: "Animation Planner",
            objective: "Describe animation frames, loops, and motion cues that fit the asset budget.",
            prompt: "Specify the minimal animation beats that make the scene feel alive without widening scope.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "art-handoff",
        label: "Art Handoff",
        objective: "Turn the art plan into a clean builder handoff.",
        primaryType: "text",
        routeSpecializations: ["pixel-art"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "art-handoff",
            label: "Art Handoff",
            objective: "Package the asset plan into the shortest handoff the builder can execute against.",
            prompt: "Present the asset brief as a clean build handoff with no missing dimensions or naming ambiguity.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  game_promo: {
    id: "game_promo",
    workstreams: [
      {
        id: "promo-render",
        label: "Promo Render",
        objective: "Produce the trailer asset or render handoff.",
        primaryType: "video",
        artifactTypesOverride: ["video", "text"],
        routeSpecializations: ["remotion"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "video-editor",
            label: "Video Editor",
            objective: "Turn the game into a trailer-ready render output.",
            prompt: "Produce the promo render artifact or final video handoff that best sells the requested game slice.",
          },
        ],
        childFamilyId: "game_promo",
        expansionBias: 2.5,
      },
      {
        id: "promo-core",
        label: "Promo Core",
        objective: "Define the core trailer angle and marketing hook.",
        primaryType: "text",
        routeSpecializations: ["remotion"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "promo-strategist",
            label: "Promo Strategist",
            objective: "Turn the build into one sharp trailer angle with a strong CTA.",
            prompt: "Define the single strongest hook and launch framing for the requested game slice.",
          },
        ],
        childFamilyId: "game_promo",
        expansionBias: 2.1,
      },
      {
        id: "promo-script",
        label: "Trailer Script",
        objective: "Write the trailer script and voiceover beats.",
        primaryType: "text",
        routeSpecializations: ["remotion"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "trailer-writer",
            label: "Trailer Writer",
            objective: "Write the shortest trailer script that clearly sells the game.",
            prompt: "Write the trailer beats, captions, and CTA in the order they should land.",
          },
        ],
        expansionBias: 1.8,
      },
      {
        id: "promo-launch-copy",
        label: "Launch Copy",
        objective: "Write the short launch copy pack.",
        primaryType: "text",
        routeSpecializations: ["remotion"],
        frameworkOverride: null,
        languageOverride: "text",
        roles: [
          {
            id: "launch-copywriter",
            label: "Launch Copywriter",
            objective: "Write the short social, store, and demo copy for launch.",
            prompt: "Produce the short copy pack Mercenary can reuse on the receipt, landing page, and demo caption.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  text_root: {
    id: "text_root",
    workstreams: [
      {
        id: "answer",
        label: "Answer",
        objective: "Produce the direct synthesized answer.",
        primaryType: "text",
        roles: [
          {
            id: "lead-answer",
            label: "Lead Answer",
            objective: "Produce the clearest direct answer from the supplied evidence.",
            prompt: "Give the main answer directly and keep it grounded in the provided context.",
          },
        ],
        childFamilyId: "text_answer",
        expansionBias: 3,
      },
      {
        id: "risk",
        label: "Risk",
        objective: "Find edge cases, caveats, and failure modes.",
        primaryType: "text",
        roles: [
          {
            id: "risk-review",
            label: "Risk Review",
            objective: "Add edge cases, caveats, and failure modes the lead answer could miss.",
            prompt: "Assume another provider gives the main answer. Focus on caveats, counterexamples, and sharp edges.",
          },
        ],
        childFamilyId: "text_risk",
        expansionBias: 1.8,
      },
      {
        id: "constraints",
        label: "Constraints",
        objective: "Find missing context, unsupported assumptions, and hard limits.",
        primaryType: "text",
        roles: [
          {
            id: "constraint-check",
            label: "Constraint Check",
            objective: "Check the answer against stated limits, missing context, and unsupported assumptions.",
            prompt: "Look for where the task is under-scoped, ambiguous, or likely to tempt an unsupported claim.",
          },
        ],
        childFamilyId: "text_constraints",
        expansionBias: 1.5,
      },
      {
        id: "execution",
        label: "Execution",
        objective: "Turn the result into a short next-step plan.",
        primaryType: "text",
        roles: [
          {
            id: "action-plan",
            label: "Action Plan",
            objective: "Turn the result into a short next-step recommendation.",
            prompt: "Focus on what the caller should do next, with concrete and low-risk steps.",
          },
        ],
        childFamilyId: "text_execution",
        expansionBias: 1.1,
      },
    ],
  },
  text_answer: {
    id: "text_answer",
    workstreams: [
      {
        id: "answer-core",
        label: "Answer Core",
        objective: "Produce the main answer body.",
        primaryType: "text",
        roles: [
          {
            id: "lead-answer",
            label: "Lead Answer",
            objective: "State the direct answer with the highest confidence.",
            prompt: "State the answer directly and keep it grounded in the supplied context.",
          },
        ],
        childFamilyId: "text_answer",
        expansionBias: 2.9,
      },
      {
        id: "answer-evidence",
        label: "Answer Evidence",
        objective: "Provide the strongest support for the answer.",
        primaryType: "text",
        roles: [
          {
            id: "evidence-review",
            label: "Evidence Review",
            objective: "Pull the strongest rationale that supports the answer.",
            prompt: "Support the answer with the strongest rationale from the supplied context.",
          },
          {
            id: "cross-check",
            label: "Cross Check",
            objective: "Look for evidence that either confirms or weakens the answer.",
            prompt: "Cross-check the main answer against competing interpretations in the prompt.",
          },
        ],
        expansionBias: 1.7,
      },
      {
        id: "answer-clarity",
        label: "Answer Clarity",
        objective: "Tighten the answer for readability and precision.",
        primaryType: "text",
        roles: [
          {
            id: "clarity-pass",
            label: "Clarity Pass",
            objective: "Rewrite the answer into shorter, clearer language.",
            prompt: "Rewrite the answer into concise, direct language without dropping important meaning.",
          },
        ],
        expansionBias: 1.4,
      },
      {
        id: "answer-limits",
        label: "Answer Limits",
        objective: "Expose limits and unsupported assumptions in the answer.",
        primaryType: "text",
        roles: [
          {
            id: "limit-check",
            label: "Limit Check",
            objective: "Find where the answer could overreach or understate uncertainty.",
            prompt: "Call out where the answer could overreach or where the provided context runs out.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "answer-alternatives",
        label: "Answer Alternatives",
        objective: "Offer competing framings or interpretations worth comparing.",
        primaryType: "text",
        roles: [
          {
            id: "alternative-framing",
            label: "Alternative Framing",
            objective: "Offer the next best framing or interpretation of the answer.",
            prompt: "State the strongest alternative framing Mercenary should compare before finalizing the answer.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  text_constraints: {
    id: "text_constraints",
    workstreams: [
      {
        id: "constraints-core",
        label: "Constraints Core",
        objective: "Find the strongest missing-context or unsupported-claim risk.",
        primaryType: "text",
        roles: [
          {
            id: "constraint-check",
            label: "Constraint Check",
            objective: "Check the answer against missing context and unsupported assumptions.",
            prompt: "Find where the answer is under-scoped, ambiguous, or unsupported.",
          },
        ],
        childFamilyId: "text_constraints",
        expansionBias: 2.6,
      },
      {
        id: "constraints-boundaries",
        label: "Constraints Boundaries",
        objective: "Identify hard boundaries around what the answer can claim.",
        primaryType: "text",
        roles: [
          {
            id: "boundary-check",
            label: "Boundary Check",
            objective: "Identify the exact boundaries around the answer.",
            prompt: "State where the answer clearly stops being supported by the prompt.",
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: "constraints-dependencies",
        label: "Constraints Dependencies",
        objective: "Identify external dependencies or hidden preconditions.",
        primaryType: "text",
        roles: [
          {
            id: "dependency-check",
            label: "Dependency Check",
            objective: "Look for dependencies or preconditions the answer assumes.",
            prompt: "List hidden dependencies, unstated prerequisites, or implied conditions behind the answer.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "constraints-ambiguity",
        label: "Constraints Ambiguity",
        objective: "Expose ambiguous wording and interpretation risk.",
        primaryType: "text",
        roles: [
          {
            id: "ambiguity-check",
            label: "Ambiguity Check",
            objective: "Expose ambiguous wording that could change the answer.",
            prompt: "Call out ambiguous phrases or unresolved interpretations in the task.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
  text_risk: {
    id: "text_risk",
    workstreams: [
      {
        id: "risk-core",
        label: "Risk Core",
        objective: "Find the most important caveats and failure modes.",
        primaryType: "text",
        roles: [
          {
            id: "risk-review",
            label: "Risk Review",
            objective: "Add the strongest caveats and failure modes to the answer.",
            prompt: "Find the caveats, counterexamples, and sharp edges the main answer could miss.",
          },
        ],
        childFamilyId: "text_risk",
        expansionBias: 2.5,
      },
      {
        id: "risk-counterexamples",
        label: "Risk Counterexamples",
        objective: "Find concrete counterexamples that could weaken the answer.",
        primaryType: "text",
        roles: [
          {
            id: "counterexample-hunt",
            label: "Counterexample Hunt",
            objective: "Find concrete situations where the main answer could break down.",
            prompt: "State the strongest counterexamples or failure cases against the main answer.",
          },
        ],
        expansionBias: 1.6,
      },
      {
        id: "risk-abuse",
        label: "Risk Abuse",
        objective: "Look for misuse, abuse, or dangerous follow-on actions.",
        primaryType: "text",
        roles: [
          {
            id: "abuse-case-review",
            label: "Abuse Case Review",
            objective: "Look for unsafe or misleading ways the answer could be applied.",
            prompt: "State how a caller could misuse the answer or draw unsafe conclusions from it.",
          },
        ],
        expansionBias: 1.1,
      },
      {
        id: "risk-uncertainty",
        label: "Risk Uncertainty",
        objective: "Explain what remains unknown after synthesis.",
        primaryType: "text",
        roles: [
          {
            id: "uncertainty-note",
            label: "Uncertainty Note",
            objective: "Capture the main unresolved uncertainties after review.",
            prompt: "State the biggest unknowns Mercenary should preserve in the final answer.",
          },
        ],
        expansionBias: 0.9,
      },
    ],
  },
  text_execution: {
    id: "text_execution",
    workstreams: [
      {
        id: "execution-core",
        label: "Execution Core",
        objective: "Turn the answer into the best immediate next-step plan.",
        primaryType: "text",
        roles: [
          {
            id: "action-plan",
            label: "Action Plan",
            objective: "Turn the result into a short next-step recommendation.",
            prompt: "Focus on what the caller should do next, with concrete and low-risk steps.",
          },
        ],
        childFamilyId: "text_execution",
        expansionBias: 2.4,
      },
      {
        id: "execution-validation",
        label: "Execution Validation",
        objective: "State how the caller should validate the next step.",
        primaryType: "text",
        roles: [
          {
            id: "validation-plan",
            label: "Validation Plan",
            objective: "Describe how the caller should validate the chosen action.",
            prompt: "State the shortest validation path for the recommended next step.",
          },
        ],
        expansionBias: 1.5,
      },
      {
        id: "execution-ordering",
        label: "Execution Ordering",
        objective: "Order the next steps to reduce risk and rework.",
        primaryType: "text",
        roles: [
          {
            id: "step-ordering",
            label: "Step Ordering",
            objective: "Order the next steps to keep risk and rework low.",
            prompt: "State the safest order in which the caller should execute the next steps.",
          },
        ],
        expansionBias: 1.2,
      },
      {
        id: "execution-fallback",
        label: "Execution Fallback",
        objective: "Preserve fallback options if the first action fails.",
        primaryType: "text",
        roles: [
          {
            id: "fallback-plan",
            label: "Fallback Plan",
            objective: "Preserve the safest fallback if the first action fails.",
            prompt: "Describe what the caller should do if the first recommended action does not work.",
          },
        ],
        expansionBias: 1,
      },
    ],
  },
};

export function buildContributionRolePlan(input: {
  task: SanitizedTaskSpec;
  providerIndex: number;
  totalExperts: number;
  providerSpecializations?: string[];
}): ContributionRolePlan {
  const templates = buildContributionRoleSequence({
    task: input.task,
    totalExperts: input.totalExperts,
  });
  const template = templates[Math.max(0, input.providerIndex - 1)] ?? templates[templates.length - 1]!;
  const specializationNote =
    input.providerSpecializations != null && input.providerSpecializations.length > 0
      ? `Lean on these strengths when they help: ${input.providerSpecializations.slice(0, 3).join(", ")}.`
      : undefined;

  return {
    id: template.id,
    label: template.label,
    objective: template.objective,
    prompt: [template.prompt, specializationNote].filter(Boolean).join(" "),
    workstreamId: template.workstreamId,
    workstreamLabel: template.workstreamLabel,
    workstreamObjective: template.workstreamObjective,
  };
}

export function buildContributionRoleSequence(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
}): ContributionRolePlan[] {
  const allocations = buildContributionWorkstreamAllocations(input);

  return allocations.flatMap((allocation) =>
    expandRoleTemplates(allocation.template, allocation.assignedExperts).map((role) => ({
      id: role.id,
      label: role.label,
      objective: role.objective,
      prompt: role.prompt,
      workstreamId: allocation.template.id,
      workstreamLabel: allocation.template.label,
      workstreamObjective: allocation.template.objective,
    })),
  );
}

export function buildContributionWorkstreamAllocations(input: {
  task: SanitizedTaskSpec;
  totalExperts: number;
  familyId?: ContributionFamilyId;
}): ContributionWorkstreamAllocation[] {
  const family = getContributionFamily(input.familyId ?? getRootContributionFamilyId(input.task));
  const authoredWorkstreams = authorContributionFamilyWorkstreams(input.task, family.workstreams);
  const activeTemplates = authoredWorkstreams.slice(0, Math.min(Math.max(1, input.totalExperts), authoredWorkstreams.length));
  const allocation = new Map(activeTemplates.map((template) => [template.id, 1]));
  let remaining = Math.max(0, input.totalExperts - activeTemplates.length);

  while (remaining > 0) {
    const next = selectExpansionTarget(activeTemplates, allocation);
    allocation.set(next.id, (allocation.get(next.id) ?? 0) + 1);
    remaining -= 1;
  }

  return activeTemplates.map((template) => ({
    template,
    assignedExperts: allocation.get(template.id) ?? 1,
  }));
}

export function getRootContributionFamilyId(task: SanitizedTaskSpec): ContributionFamilyId {
  if (taskCanRouteThroughGameWorkstreams(task) && isGameTask(task)) {
    return "game_root";
  }
  return (task.output?.primaryType ?? "patch") === "patch" ? "patch_root" : "text_root";
}

export function getContributionFamily(familyId: ContributionFamilyId): ContributionFamily {
  return FAMILIES[familyId];
}

export function getContributionWorkstreamTemplate(
  task: SanitizedTaskSpec,
  workstreamId: string,
): ContributionWorkstreamTemplate | undefined {
  for (const family of Object.values(FAMILIES)) {
    const authored = authorContributionFamilyWorkstreams(task, family.workstreams).find((template) => template.id === workstreamId);
    if (authored) {
      return authored;
    }
  }

  return undefined;
}

function expandRoleTemplates(
  template: ContributionWorkstreamTemplate,
  totalExperts: number,
): ContributionRoleTemplate[] {
  return Array.from({ length: Math.max(1, totalExperts) }, (_, index) => {
    return template.roles[index] ?? template.roles[index % template.roles.length]!;
  });
}

function selectExpansionTarget(
  templates: ContributionWorkstreamTemplate[],
  allocation: Map<string, number>,
): ContributionWorkstreamTemplate {
  return templates.reduce((best, current) => {
    const bestScore = scoreExpansion(best, allocation.get(best.id) ?? 1);
    const currentScore = scoreExpansion(current, allocation.get(current.id) ?? 1);
    return currentScore > bestScore ? current : best;
  });
}

function scoreExpansion(template: ContributionWorkstreamTemplate, currentExperts: number): number {
  return template.expansionBias / Math.max(currentExperts, 1);
}

function authorContributionFamilyWorkstreams(
  task: SanitizedTaskSpec,
  workstreams: ContributionWorkstreamTemplate[],
): ContributionWorkstreamTemplate[] {
  const context = buildTaskPlanningContext(task);
  return workstreams.map((workstream) => ({
    ...workstream,
    objective: authorWorkstreamObjective(workstream, context),
    routeSpecializations: authorRouteSpecializations(task, workstream),
    roles: workstream.roles.map((role) => ({
      ...role,
      objective: authorRoleObjective(role.id, context, role.objective),
      prompt: authorRolePrompt(role.id, context, role.prompt),
    })),
  }));
}

function buildTaskPlanningContext(task: SanitizedTaskSpec): TaskPlanningContext {
  const focusLabel = buildFocusLabel(task);
  const signalCandidate =
    task.failingSignals.errors[0] ??
    task.failingSignals.observedBehavior ??
    task.failingSignals.expectedBehavior;

  return {
    focusLabel,
    surfacePhrase: buildSurfacePhrase(task),
    signalLabel: signalCandidate == null ? undefined : trimSentence(signalCandidate, 100),
  };
}

function authorRouteSpecializations(
  task: SanitizedTaskSpec,
  workstream: ContributionWorkstreamTemplate,
): string[] | undefined {
  const inherited = workstream.routeSpecializations ?? [];
  if ((task.output?.primaryType ?? "patch") !== "text" || !isGameTask(task)) {
    return inherited;
  }

  const id = workstream.id;
  let preferred: string[] = [];

  if (id === "answer" || id.startsWith("answer-") || id === "execution" || id.startsWith("execution-")) {
    preferred = ["gb-studio"];
  } else if (id === "constraints" || id.startsWith("constraints-")) {
    preferred = ["pixel-art"];
  } else if (id === "risk" || id.startsWith("risk-")) {
    preferred = ["remotion"];
  }

  return uniqueRouteSpecializations([...inherited, ...preferred]);
}

function uniqueRouteSpecializations(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function taskCanRouteThroughGameWorkstreams(task: SanitizedTaskSpec): boolean {
  const primaryType = task.output?.primaryType ?? "patch";
  return (
    primaryType === "patch" ||
    task.output?.artifactTypes?.includes("patch") === true ||
    task.constraints.allowedOutputTypes?.includes("patch") === true
  );
}

function isGameTask(task: SanitizedTaskSpec): boolean {
  const haystack = [
    task.framework,
    task.taskTitle,
    task.taskDescription,
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    ...task.failingSignals.errors,
    ...task.constraints.requireSpecializations,
    ...task.files.map((file) => file.path),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  if (haystack.length === 0) {
    return false;
  }

  if (/\bgb[\s-]?studio\b/.test(haystack)) {
    return true;
  }

  const strongSignals = [
    "pixel art",
    "pixel-art",
    "sprite",
    "tileset",
    "tilemap",
    "remotion",
    "trailer",
    "launch copy",
    "video marketing",
  ].filter((signal) => haystack.includes(signal)).length;

  if (strongSignals >= 2) {
    return true;
  }

  return /\bgame(play)?\b/.test(haystack) && strongSignals >= 1;
}

function buildFocusLabel(task: SanitizedTaskSpec): string {
  const candidates = [
    task.taskTitle,
    task.failingSignals.errors[0],
    task.failingSignals.expectedBehavior,
    task.failingSignals.observedBehavior,
    task.taskDescription,
    task.files[0]?.path,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeFocusCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return (task.output?.primaryType ?? "patch") === "patch" ? "the requested fix" : "the requested answer";
}

function normalizeFocusCandidate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  let normalized = value
    .replace(/\s+/g, " ")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("/")) {
    normalized = basename(normalized);
  }

  normalized = normalized
    .replace(
      /^(fix|debug|resolve|inspect|explain|analyze|analyse|review|investigate|create|build|implement|plan|write|summarize|compare|describe)\s+/i,
      "",
    )
    .replace(/^the\s+/i, "");

  const andIndex = normalized.search(/\sand\s/i);
  if (andIndex !== -1) {
    const head = normalized.slice(0, andIndex).trim();
    const tail = normalized.slice(andIndex + 5).trim();
    if (/\b(explain|describe|fix|debug|review|summarize|compare|plan|show|tell)\b/i.test(tail) && head.length >= 4) {
      normalized = head;
    }
  }

  normalized = normalized
    .replace(/\bplease\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 4) {
    return undefined;
  }

  return trimSentence(normalized, 64);
}

function buildSurfacePhrase(task: SanitizedTaskSpec): string {
  if (task.files.length > 0) {
    const primaryFile = basename(task.files[0]!.path);
    return `the code around ${primaryFile}`;
  }

  if (task.framework && task.language !== "text") {
    return `the ${task.framework} ${task.language} context`;
  }

  if (task.framework) {
    return `the ${task.framework} context`;
  }

  if (task.language !== "text") {
    return `the ${task.language} context`;
  }

  return "the supplied context";
}

function authorWorkstreamObjective(
  template: ContributionWorkstreamTemplate,
  context: TaskPlanningContext,
): string {
  const focus = context.focusLabel;

  switch (true) {
    case template.id === "gameplay":
      return `Produce the playable build for ${focus}.`;
    case template.id.startsWith("gameplay-core"):
      return `Produce the main GB Studio patch for ${focus}.`;
    case template.id.startsWith("gameplay-qa"):
      return `Find broken loops and missing validation around ${focus}.`;
    case template.id.startsWith("gameplay-scope"):
      return `Lock the smallest safe gameplay scope for ${focus}.`;
    case template.id.startsWith("gameplay-handoff"):
      return `Turn ${focus} into a clean gameplay handoff.`;
    case template.id === "pixel-art":
      return `Define the pixel-art pack for ${focus}.`;
    case template.id.startsWith("art-direction"):
      return `Lock the art direction for ${focus}.`;
    case template.id.startsWith("art-assets"):
      return `List the concrete sprites, tiles, and UI parts for ${focus}.`;
    case template.id.startsWith("art-animation"):
      return `Define the animation notes for ${focus}.`;
    case template.id.startsWith("art-handoff"):
      return `Turn the art plan for ${focus} into a clean builder handoff.`;
    case template.id === "video-marketing":
      return `Turn ${focus} into a trailer and launch angle.`;
    case template.id.startsWith("promo-core"):
      return `Define the core trailer angle for ${focus}.`;
    case template.id.startsWith("promo-render"):
      return `Produce the trailer asset or render handoff for ${focus}.`;
    case template.id.startsWith("promo-script"):
      return `Write the trailer script for ${focus}.`;
    case template.id.startsWith("promo-launch-copy"):
      return `Write the short launch copy pack for ${focus}.`;
    case template.id === "diagnosis":
      return `Explain what is broken in ${focus}.`;
    case template.id.startsWith("diagnosis-core"):
      return `Pin down the smallest valid explanation of ${focus}.`;
    case template.id.startsWith("diagnosis-repro"):
      return `Reduce ${focus} to a short reproducible path.`;
    case template.id.startsWith("diagnosis-surface"):
      return `Map the files and interfaces that matter to ${focus}.`;
    case template.id.startsWith("diagnosis-constraints"):
      return `Expose uncertainty and risky assumptions around ${focus}.`;
    case template.id === "implementation":
      return `Produce the concrete fix for ${focus}.`;
    case template.id.startsWith("implementation-core"):
      return `Produce the main implementation diff for ${focus}.`;
    case template.id.startsWith("implementation-safety"):
      return `Stress test the implementation for ${focus} for safety and scope control.`;
    case template.id.startsWith("implementation-merge"):
      return `Reduce merge friction around the implementation for ${focus}.`;
    case template.id.startsWith("implementation-validation"):
      return `Turn the implementation for ${focus} into a concise validation path.`;
    case template.id.startsWith("implementation-fallback"):
      return `Preserve rollback and fallback options around ${focus}.`;
    case template.id === "verification":
      return `Stress test the likely fix for ${focus}.`;
    case template.id.startsWith("verification-core"):
      return `Find the most likely ways the fix for ${focus} could still fail.`;
    case template.id.startsWith("verification-edge-cases"):
      return `Hunt for edge cases around ${focus}.`;
    case template.id.startsWith("verification-contracts"):
      return `Check that the fix for ${focus} still matches surrounding contracts.`;
    case template.id.startsWith("verification-runtime"):
      return `Define the shortest runtime or test path for ${focus}.`;
    case template.id === "delivery":
      return `Turn the fix for ${focus} into rollout and validation notes.`;
    case template.id === "answer":
      return `Produce the direct synthesized answer for ${focus}.`;
    case template.id.startsWith("answer-core"):
      return `Produce the main answer body for ${focus}.`;
    case template.id.startsWith("answer-evidence"):
      return `Support the answer for ${focus} with the strongest rationale.`;
    case template.id.startsWith("answer-clarity"):
      return `Tighten the answer for ${focus} for readability and precision.`;
    case template.id.startsWith("answer-limits"):
      return `Expose limits and unsupported assumptions around ${focus}.`;
    case template.id.startsWith("answer-alternatives"):
      return `Offer competing framings of ${focus} worth comparing.`;
    case template.id === "constraints":
      return `Find missing context and unsupported assumptions around ${focus}.`;
    case template.id.startsWith("constraints-core"):
      return `Find the strongest missing-context risk around ${focus}.`;
    case template.id.startsWith("constraints-boundaries"):
      return `Identify hard boundaries around what can be claimed about ${focus}.`;
    case template.id.startsWith("constraints-dependencies"):
      return `Identify hidden dependencies behind ${focus}.`;
    case template.id.startsWith("constraints-ambiguity"):
      return `Expose ambiguous wording that affects ${focus}.`;
    case template.id === "risk":
      return `Find caveats and failure modes around ${focus}.`;
    case template.id.startsWith("risk-core"):
      return `Find the most important caveats around ${focus}.`;
    case template.id.startsWith("risk-counterexamples"):
      return `Find concrete counterexamples against ${focus}.`;
    case template.id.startsWith("risk-abuse"):
      return `Look for misuse or dangerous follow-on actions around ${focus}.`;
    case template.id.startsWith("risk-uncertainty"):
      return `Explain what remains unknown about ${focus}.`;
    case template.id === "execution":
      return `Turn ${focus} into the safest next-step plan.`;
    case template.id.startsWith("execution-core"):
      return `Turn ${focus} into the best immediate next-step plan.`;
    case template.id.startsWith("execution-validation"):
      return `State how the caller should validate the next step for ${focus}.`;
    case template.id.startsWith("execution-ordering"):
      return `Order the next steps for ${focus} to reduce risk and rework.`;
    case template.id.startsWith("execution-fallback"):
      return `Preserve fallback options if the first step around ${focus} fails.`;
    default:
      return template.objective;
  }
}

function authorRoleObjective(
  roleId: string,
  context: TaskPlanningContext,
  fallback: string,
): string {
  const focus = context.focusLabel;

  switch (roleId) {
    case "gb-studio-builder":
    case "gameplay-builder":
      return `Build the playable GB Studio version of ${focus}.`;
    case "gameplay-qa":
      return `Find blocked progress, missing hooks, and brittle logic around ${focus}.`;
    case "mechanic-scope":
      return `Constrain ${focus} to the smallest complete gameplay slice.`;
    case "asset-handoff":
      return `List the exact scene, event, and asset handoff for ${focus}.`;
    case "pixel-artist":
    case "art-director":
      return `Define the visual direction and asset plan for ${focus}.`;
    case "sprite-planner":
      return `Turn ${focus} into a concrete sprite and tile checklist.`;
    case "animation-planner":
      return `Describe the minimal animation beats for ${focus}.`;
    case "art-handoff":
      return `Package the art plan for ${focus} into a clean builder handoff.`;
    case "video-marketer":
    case "promo-strategist":
      return `Turn ${focus} into the strongest trailer hook and launch angle.`;
    case "video-editor":
      return `Turn ${focus} into a trailer-ready video artifact or render handoff.`;
    case "trailer-writer":
      return `Write the shortest trailer script that sells ${focus}.`;
    case "launch-copywriter":
      return `Write the short launch copy pack for ${focus}.`;
    case "root-cause":
      return `Isolate exactly why ${focus} fails.`;
    case "repro-reduction":
      return `Reduce ${focus} to the shortest reproducible sequence.`;
    case "failure-trace":
      return `Describe where ${focus} becomes visible to the caller.`;
    case "surface-mapping":
      return `Map the narrowest code surface that matters to ${focus}.`;
    case "constraint-check":
      return `Find missing context or unsupported assumptions around ${focus}.`;
    case "patch-author":
      return `Write the safest concrete fix for ${focus}.`;
    case "patch-safety":
      return `Find unsafe edits or brittle assumptions around the fix for ${focus}.`;
    case "side-effect-scan":
      return `Look for hidden behavior changes the fix for ${focus} could trigger.`;
    case "patch-merge":
      return `Reduce merge friction around the fix for ${focus}.`;
    case "diff-shape":
      return `Keep the diff for ${focus} compact and easy to review.`;
    case "patch-validation":
    case "acceptance-checks":
    case "runtime-checks":
      return `Define the shortest checks that validate the fix for ${focus}.`;
    case "rollback-plan":
      return `State the safest rollback posture if the fix for ${focus} misbehaves.`;
    case "regression-review":
    case "edge-case-hunter":
      return `Find the strongest regression and edge-case risks around ${focus}.`;
    case "contract-check":
      return `Check that the fix for ${focus} still matches surrounding contracts.`;
    case "change-explainer":
      return `Turn the fix for ${focus} into a concise rollout note.`;
    case "lead-answer":
      return `State the direct answer for ${focus} with the highest confidence.`;
    case "evidence-review":
    case "cross-check":
      return `Pull the strongest supporting rationale for ${focus}.`;
    case "clarity-pass":
      return `Rewrite the answer for ${focus} into shorter, clearer language.`;
    case "limit-check":
    case "boundary-check":
      return `Expose the main support limits around ${focus}.`;
    case "alternative-framing":
      return `Offer the strongest alternative framing of ${focus}.`;
    case "dependency-check":
      return `Find hidden dependencies behind ${focus}.`;
    case "ambiguity-check":
      return `Expose ambiguous wording that changes how ${focus} should be read.`;
    case "risk-review":
    case "counterexample-hunt":
      return `Find caveats and counterexamples around ${focus}.`;
    case "abuse-case-review":
      return `Look for unsafe follow-on uses of the answer for ${focus}.`;
    case "uncertainty-note":
      return `Capture the main unresolved uncertainty around ${focus}.`;
    case "action-plan":
      return `Turn ${focus} into a low-risk next-step recommendation.`;
    case "validation-plan":
      return `State how the caller should validate the next step for ${focus}.`;
    case "step-ordering":
      return `Order the safest next steps around ${focus}.`;
    case "fallback-plan":
      return `Describe the fallback if the first step around ${focus} fails.`;
    default:
      return fallback;
  }
}

function authorRolePrompt(
  roleId: string,
  context: TaskPlanningContext,
  fallback: string,
): string {
  const focus = context.focusLabel;
  const signalNote = context.signalLabel ? ` Anchor on this signal: ${context.signalLabel}.` : "";

  switch (roleId) {
    case "gb-studio-builder":
      return `Implement the playable GB Studio scene, events, and repo edits needed for ${focus}.${signalNote}`;
    case "gameplay-builder":
      return `Write the core GB Studio repo changes that make ${focus} playable end to end.${signalNote}`;
    case "gameplay-qa":
      return `Assume another provider builds ${focus}. Focus on dead ends, missing triggers, scene transitions, and validation steps.${signalNote}`;
    case "mechanic-scope":
      return `State the smallest complete gameplay slice Mercenary should preserve for ${focus}.${signalNote}`;
    case "asset-handoff":
      return `List the exact asset hooks, scene names, and event expectations the final build for ${focus} needs.${signalNote}`;
    case "pixel-artist":
      return `Produce a pixel-art brief for ${focus} with palette, sprite list, tile plan, canvas sizes, and animation notes.${signalNote}`;
    case "art-director":
      return `Define the visual direction for ${focus} so it reads coherently in a Game Boy-scale frame.${signalNote}`;
    case "sprite-planner":
      return `List the concrete asset pack for ${focus} with canvas sizes, counts, and reuse rules.${signalNote}`;
    case "animation-planner":
      return `Specify the minimal animation beats that make ${focus} feel alive without widening scope.${signalNote}`;
    case "art-handoff":
      return `Present the art brief for ${focus} as a clean build handoff with no missing dimensions or naming ambiguity.${signalNote}`;
    case "video-marketer":
      return `Produce the trailer hook, shot list, CTA, and launch copy that best sells ${focus}.${signalNote}`;
    case "promo-strategist":
      return `Define the single strongest hook and launch framing for ${focus}.${signalNote}`;
    case "video-editor":
      return `Produce the promo render artifact or final video handoff that best sells ${focus}.${signalNote}`;
    case "trailer-writer":
      return `Write the trailer beats, captions, and CTA for ${focus} in the order they should land.${signalNote}`;
    case "launch-copywriter":
      return `Produce the short copy pack Mercenary can reuse to launch ${focus}.${signalNote}`;
    case "root-cause":
      return `Focus on why ${focus} fails within ${context.surfacePhrase}.${signalNote}`;
    case "repro-reduction":
      return `Reduce ${focus} to the shortest concrete repro path inside ${context.surfacePhrase}.${signalNote}`;
    case "failure-trace":
      return `Call out the state transition or code path where ${focus} becomes visible.${signalNote}`;
    case "surface-mapping":
      return `List the narrowest files, modules, or interfaces inside ${context.surfacePhrase} that matter to ${focus}.${signalNote}`;
    case "constraint-check":
      return `Call out missing context, ambiguity, or unsupported assumptions around ${focus}.${signalNote}`;
    case "patch-author":
      return `Write the minimal patch that resolves ${focus} within ${context.surfacePhrase}.${signalNote}`;
    case "patch-safety":
      return `Review the likely patch for ${focus} for unsafe scope changes, brittle assumptions, and rollback risk.${signalNote}`;
    case "side-effect-scan":
      return `Focus on hidden callers, state transitions, and side effects the fix for ${focus} might disturb.${signalNote}`;
    case "patch-merge":
      return `Look for ways to make the fix for ${focus} easier to merge and reconcile with adjacent changes.${signalNote}`;
    case "diff-shape":
      return `Call out how to keep the final diff for ${focus} compact and easy to review.${signalNote}`;
    case "patch-validation":
    case "acceptance-checks":
    case "runtime-checks":
      return `State the shortest objective checks that prove the fix for ${focus} is acceptable.${signalNote}`;
    case "rollback-plan":
      return `Describe the cleanest rollback or fallback posture if the fix for ${focus} fails.${signalNote}`;
    case "regression-review":
      return `Assume another provider wrote the fix for ${focus}. Focus on regressions, edge cases, and scope control.${signalNote}`;
    case "edge-case-hunter":
      return `List concrete edge cases or boundary conditions where the fix for ${focus} could still fail.${signalNote}`;
    case "contract-check":
      return `Look for interfaces, invariants, or hidden assumptions the fix for ${focus} could violate.${signalNote}`;
    case "change-explainer":
      return `Explain why the fix for ${focus} is safe, what still looks uncertain, and how to validate it.${signalNote}`;
    case "lead-answer":
      return `State the answer directly for ${focus} and keep it grounded in ${context.surfacePhrase}.${signalNote}`;
    case "evidence-review":
      return `Support the answer for ${focus} with the strongest rationale from ${context.surfacePhrase}.${signalNote}`;
    case "cross-check":
      return `Cross-check the main answer for ${focus} against competing interpretations in the supplied context.${signalNote}`;
    case "clarity-pass":
      return `Rewrite the answer for ${focus} into concise, direct language without dropping important meaning.${signalNote}`;
    case "limit-check":
      return `Call out where the answer for ${focus} could overreach or where the provided context runs out.${signalNote}`;
    case "alternative-framing":
      return `State the strongest alternative framing of ${focus} Mercenary should compare before finalizing the answer.${signalNote}`;
    case "boundary-check":
      return `State where claims about ${focus} clearly stop being supported by the prompt.${signalNote}`;
    case "dependency-check":
      return `List hidden dependencies, unstated prerequisites, or implied conditions behind ${focus}.${signalNote}`;
    case "ambiguity-check":
      return `Call out ambiguous phrases or unresolved interpretations that change how ${focus} should be read.${signalNote}`;
    case "risk-review":
      return `Assume another provider gives the main answer for ${focus}. Focus on caveats, counterexamples, and sharp edges.${signalNote}`;
    case "counterexample-hunt":
      return `State the strongest counterexamples or failure cases against the main answer for ${focus}.${signalNote}`;
    case "abuse-case-review":
      return `State how a caller could misuse the answer for ${focus} or draw unsafe conclusions from it.${signalNote}`;
    case "uncertainty-note":
      return `State the biggest unknowns Mercenary should preserve in the final answer for ${focus}.${signalNote}`;
    case "action-plan":
      return `Focus on what the caller should do next about ${focus}, with concrete and low-risk steps.${signalNote}`;
    case "validation-plan":
      return `State the shortest validation path for the recommended next step on ${focus}.${signalNote}`;
    case "step-ordering":
      return `State the safest order in which the caller should execute the next steps on ${focus}.${signalNote}`;
    case "fallback-plan":
      return `Describe what the caller should do if the first recommended action on ${focus} does not work.${signalNote}`;
    default:
      return `${fallback}${signalNote}`.trim();
  }
}

function trimSentence(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
  return `${clipped}...`;
}

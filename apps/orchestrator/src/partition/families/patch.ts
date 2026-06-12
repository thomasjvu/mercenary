import type { ContributionFamily } from '../types.js';

export const patchFamilies = {
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
} satisfies Record<
  'patch_root' | 'patch_diagnosis' | 'patch_implementation' | 'patch_verification',
  ContributionFamily
>;

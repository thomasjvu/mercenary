import type { ContributionFamily } from '../types.js';

export const textFamilies = {
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
} satisfies Record<
  'text_root' | 'text_answer' | 'text_constraints' | 'text_risk' | 'text_execution',
  ContributionFamily
>;

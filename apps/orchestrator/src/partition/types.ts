import type { OutputType, SanitizedTaskSpec } from '@bossraid/shared-types';

export type ContributionRoleTemplate = {
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
  | 'patch_root'
  | 'patch_diagnosis'
  | 'patch_implementation'
  | 'patch_verification'
  | 'game_root'
  | 'game_gameplay'
  | 'game_art'
  | 'game_promo'
  | 'text_root'
  | 'text_answer'
  | 'text_constraints'
  | 'text_risk'
  | 'text_execution';

export type ContributionWorkstreamTemplate = {
  id: string;
  label: string;
  objective: string;
  primaryType: OutputType;
  artifactTypesOverride?: OutputType[];
  routeSpecializations?: string[];
  frameworkOverride?: string | null;
  languageOverride?: SanitizedTaskSpec['language'];
  roles: ContributionRoleTemplate[];
  childFamilyId?: ContributionFamilyId;
  expansionBias: number;
};

export type ContributionFamily = {
  id: ContributionFamilyId;
  workstreams: ContributionWorkstreamTemplate[];
};

export type ContributionWorkstreamAllocation = {
  template: ContributionWorkstreamTemplate;
  assignedExperts: number;
};

export type TaskPlanningContext = {
  focusLabel: string;
  surfacePhrase: string;
  signalLabel?: string;
};

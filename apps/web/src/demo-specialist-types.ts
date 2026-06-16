import type { SpecialistTone } from './components/demo/demo-ui';

export type ConversationSpecialistRecord = {
  providerId: string;
  displayName: string;
  statusLabel: string;
  statusTone: SpecialistTone;
  note: string;
  meta: string;
  progressValue: number | null;
  proofTags: string[];
};

export type SpecialistTraceRecord = {
  providerId: string;
  displayName: string;
  statusLabel: string;
  statusTone: SpecialistTone;
  scope: string;
  outcome: string;
  events: Array<{
    id: string;
    at: string;
    label: string;
    note: string;
  }>;
};

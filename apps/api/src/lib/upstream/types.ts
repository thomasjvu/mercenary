import type { UpstreamProviderId } from '@bossraid/constants';

export type UpstreamModelRecord = {
  id: string;
  displayName?: string;
  teeAttested?: boolean;
  e2ee?: boolean;
  supportsE2ee?: boolean;
  maxContextTokens?: number;
  inputPer1mUsd?: number;
  outputPer1mUsd?: number;
};

export type MergedUpstreamCatalogModel = {
  modelId: string;
  displayName: string;
  modelProvider: UpstreamProviderId;
  supported: boolean;
  upstreamFound: boolean;
  teeAttested: boolean;
  e2ee: boolean;
  maxContextTokens: number | null;
  referenceInputPer1mUsd: number | null;
  referenceOutputPer1mUsd: number | null;
};

export type UpstreamChatResult = {
  content: string;
  requestId?: string;
  instanceId?: string;
};

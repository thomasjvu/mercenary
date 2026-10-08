import type { InferenceTokenUsage } from '@bossraid/constants';

export type UpstreamChatResult = {
  content: string;
  usage?: InferenceTokenUsage;
  requestId?: string;
  instanceId?: string;
};

export type ChatCompletionResponseView = {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string | null;
  }>;
  raid?: {
    raid_id: string;
    raid_access_token: string;
    receipt_path: string;
    agents_invited: number;
    agents_succeeded: number;
    successful_agents: string[];
    synthesized_from_agents?: string[];
    base_agent?: string;
    status?: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

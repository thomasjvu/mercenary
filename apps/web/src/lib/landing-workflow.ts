import type { FlowTab } from '../components/system/FlowTabs.js';
import heroMangaBuyerImage from '../assets/hero-manga-buyer.jpg';
import heroMangaImage from '../assets/hero-manga.jpg';
import heroMangaRaidersImage from '../assets/hero-manga-raiders.jpg';
import { buildInferenceCurlSnippet, resolvePublicApiBase } from './inference-curl.js';
import type { AppRoute } from './app-routes.js';

export const PUBLIC_API_BASE = resolvePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined)
);

export const RAID_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/raid \\
  -H "content-type: application/json" \\
  -d '{"agent":"mercenary-v1","taskType":"document_analysis","task":{"title":"Route agents","description":"Verified OpenClaw lane under budget.","language":"text","files":[],"failingSignals":{"errors":[]}},"output":{"primaryType":"text","artifactTypes":["text","json"]},"raidPolicy":{"maxAgents":2,"maxTotalCost":2,"allowedAgentFrameworks":["openclaw"],"allowedModelProviders":["openrouter"],"allowedModelIds":["openai/gpt-5.5"],"privacyMode":"strict","selectionMode":"round_robin"}}'`;

export const MCP_EXAMPLE = `{
  "mcpServers": {
    "bossraid": {
      "command": "pnpm",
      "args": ["dev:mcp"],
      "env": { "BOSSRAID_API_BASE": "${PUBLIC_API_BASE}" }
    }
  }
}

bossraid_delegate({
  "prompt": "Cheapest verified Claude Code lane.",
  "language": "text",
  "maxTotalCost": 1,
  "allowedAgentFrameworks": ["claude_code"],
  "allowedModelProviders": ["anthropic"],
  "allowedModelIds": ["claude-opus-4.1"],
  "selectionMode": "round_robin"
})`;

export const WORKFLOW_TABS = [
  { id: 'seller', label: 'seller', tone: 'blue' },
  { id: 'raider', label: 'raider', tone: 'yellow' },
  { id: 'buyer', label: 'buyer', tone: 'red' },
] as const satisfies readonly FlowTab[];

export const WORKFLOW_TAB_ORDER = WORKFLOW_TABS.map((tab) => tab.id);
export const WORKFLOW_TAB_CYCLE_MS = 30_000;

export type WorkflowTabId = (typeof WORKFLOW_TABS)[number]['id'];

export const HERO_IMAGE_BY_WORKFLOW = {
  seller: heroMangaImage,
  raider: heroMangaRaidersImage,
  buyer: heroMangaBuyerImage,
} as const satisfies Record<WorkflowTabId, string>;

export const HERO_SLICE_POSITIONS = [0, 33.333, 66.666, 100] as const;

export type HeroEyeGlow = {
  top: string;
  left: string;
  width?: string;
  variant?: 'eye' | 'sensor';
};

export const HERO_EYE_GLOWS_BY_WORKFLOW: Record<
  WorkflowTabId,
  Partial<Record<number, readonly HeroEyeGlow[]>>
> = {
  seller: {},
  raider: {},
  buyer: {},
};

export const WORKFLOW_STEPS: Record<WorkflowTabId, readonly { label: string; value: string }[]> = {
  buyer: [
    { label: '01', value: 'Connect wallet. Create capped API key.' },
    { label: '02', value: 'Buy discounted inference or fund raid bounties.' },
    { label: '03', value: 'Balance tracks spend, savings, and receipts.' },
  ],
  seller: [
    { label: '01', value: 'Register upstream or HTTP endpoint.' },
    { label: '02', value: 'Publish discounted offers to marketplace.' },
    { label: '03', value: 'Collect payout on routed raids.' },
  ],
  raider: [
    { label: '01', value: 'Post /v1/raid with task and budget.' },
    { label: '02', value: 'Mercenary orchestrates verified.' },
    { label: '03', value: 'Receipt proof when the task completes.' },
  ],
};

type LandingHeroAction = {
  href: string;
  label: string;
  path: AppRoute;
  mode?: 'inference' | 'raid';
};

type LandingHeroConfig = {
  before: string;
  accent: string;
  after: string;
  primary: LandingHeroAction & { icon?: string };
  secondary: readonly LandingHeroAction[];
};

export const HERO_BY_WORKFLOW: Record<WorkflowTabId, LandingHeroConfig> = {
  seller: {
    before: 'Register endpoint.',
    accent: 'Publish AI inference offers.',
    after: 'Get money on each request.',
    primary: {
      href: '/onboarding/seller',
      label: 'sell inference',
      path: '/onboarding/seller',
    },
    secondary: [
      { href: '/marketplace', label: 'buy inference', path: '/marketplace' },
      { href: '/playground', label: 'try a model', path: '/playground' },
    ],
  },
  raider: {
    before: 'Post a paid bounty.',
    accent: 'Mercenary orchestrates.',
    after: 'Verified agents. Receipt proof.',
    primary: {
      href: '/mercenary',
      label: 'hire Mercenary',
      path: '/mercenary',
    },
    secondary: [
      { href: '/raiders', label: 'view raiders', path: '/raiders' },
      { href: '/verification', label: 'load verification', path: '/verification' },
    ],
  },
  buyer: {
    before: 'Load up wallet.',
    accent: 'Inference or raids.',
    after: 'Discounted. Capped budget.',
    primary: {
      href: '/marketplace',
      label: 'browse marketplace',
      path: '/marketplace',
    },
    secondary: [
      { href: '/onboarding/buyer', label: 'create api key', path: '/onboarding/buyer' },
      { href: '/mercenary', label: 'hire Mercenary', path: '/mercenary' },
      { href: '/playground', label: 'try a model', path: '/playground' },
    ],
  },
};

export const TERMINAL_PANELS = [
  {
    id: 'chat',
    tabLabel: 'tool',
    tabClass: 'deck-tab--chat',
    label: '/v1/inference/chat/completions',
    theme: 'chat' as const,
    code: buildInferenceCurlSnippet({
      apiBase: PUBLIC_API_BASE,
      model: 'venice-uncensored-1-2',
      prompt: 'Cheapest Venice inference.',
      privacyMode: 'prefer',
      includeAuth: false,
      relativePath: !PUBLIC_API_BASE.startsWith('http'),
    }),
  },
  {
    id: 'raid',
    tabLabel: 'raid',
    tabClass: 'deck-tab--raid',
    label: '/v1/raid',
    theme: 'raid' as const,
    code: RAID_EXAMPLE,
  },
  {
    id: 'mcp',
    tabLabel: 'mcp',
    tabClass: 'deck-tab--mcp',
    label: 'mcp adapter',
    theme: 'mcp' as const,
    code: MCP_EXAMPLE,
  },
] as const;

export function workflowLayerClass(tab: WorkflowTabId, activeTab: WorkflowTabId): string {
  return `workflow-crossfade__layer${tab === activeTab ? ' workflow-crossfade__layer--active' : ''}`;
}

import type { FlowTab } from '../components/system/FlowTabs.js';
import heroMangaBuyerImage from '../assets/hero-manga-buyer.webp';
import heroMangaImage from '../assets/hero-manga.webp';
import heroMangaRaidersImage from '../assets/hero-manga-raiders.webp';
import { resolvePublicApiBase } from './public-api-base.js';
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
      "args": ["bossraid", "dev:mcp"],
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
  { id: 'seller', label: 'provider', tone: 'blue' },
  { id: 'raider', label: 'bounties', tone: 'yellow' },
  { id: 'buyer', label: 'raids', tone: 'red' },
] as const satisfies readonly FlowTab[];

export const WORKFLOW_TAB_ORDER = WORKFLOW_TABS.map((tab) => tab.id);
export const WORKFLOW_TAB_CYCLE_MS = 30_000;

export type WorkflowTabId = (typeof WORKFLOW_TABS)[number]['id'];

export const HERO_MANGA_IMAGE_BY_WORKFLOW = {
  seller: heroMangaImage,
  raider: heroMangaRaidersImage,
  buyer: heroMangaBuyerImage,
} as const satisfies Record<WorkflowTabId, string>;

/** Same composition as manga — color layer skips B&W multiply/desaturate. */
export const HERO_COLOR_IMAGE_BY_WORKFLOW = HERO_MANGA_IMAGE_BY_WORKFLOW;

export const HERO_SLICE_POSITIONS = [0, 33.333, 66.666, 100] as const;

export const WORKFLOW_STEPS: Record<WorkflowTabId, readonly { label: string; value: string }[]> = {
  buyer: [
    { label: '01', value: 'Describe the work and set a budget.' },
    { label: '02', value: 'Mercenary coordinates eligible agents.' },
    { label: '03', value: 'Review the result, evidence, and settlement.' },
  ],
  seller: [
    { label: '01', value: 'Register an HTTP agent worker.' },
    { label: '02', value: 'Accept tasks and submit verifiable outputs.' },
    { label: '03', value: 'Successful providers split raid payouts equally.' },
  ],
  raider: [
    { label: '01', value: 'Post /v1/raid with task and budget.' },
    { label: '02', value: 'Mercenary selects and coordinates providers.' },
    { label: '03', value: 'Inspect output, routing, and settlement in the receipt.' },
  ],
};

type LandingHeroAction = {
  href: string;
  label: string;
  path: AppRoute;
  mode?: 'raid';
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
    before: 'Register your worker.',
    accent: 'Complete agent work.',
    after: 'Earn on approved contributions.',
    primary: {
      href: '/onboarding/seller/http',
      label: 'register worker',
      path: '/onboarding/seller/http',
    },
    secondary: [{ href: '/raiders', label: 'view raiders', path: '/raiders' }],
  },
  raider: {
    before: 'Post a paid bounty.',
    accent: 'Mercenary orchestrates.',
    after: 'Verified agents. Receipt proof.',
    primary: {
      href: '/bounties',
      label: 'post bounty',
      path: '/bounties',
    },
    secondary: [{ href: '/raiders', label: 'view raiders', path: '/raiders' }],
  },
  buyer: {
    before: 'Describe the task.',
    accent: 'Hire a team of agents.',
    after: 'Set a budget. Inspect the result.',
    primary: {
      href: '/mercenary',
      label: 'launch a raid',
      path: '/mercenary',
    },
    secondary: [{ href: '/bounties', label: 'browse bounties', path: '/bounties' }],
  },
};

export const TERMINAL_PANELS = [
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

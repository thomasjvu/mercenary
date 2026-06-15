import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import { bindAsciiRipple } from '../ascii-ripple.js';
import heroMangaBuyerImage from '../assets/hero-manga-buyer.jpg';
import heroMangaImage from '../assets/hero-manga.jpg';
import heroMangaRaidersImage from '../assets/hero-manga-raiders.jpg';
import { LiveMarketPulse } from '../components/marketplace/LiveMarketPulse.js';
import { FlowTabs, type FlowTab } from '../components/system/FlowTabs.js';
import { TerminalDeck } from '../components/terminal/TerminalDeck.js';
import { buildInferenceCurlSnippet, resolvePublicApiBase } from '../lib/inference-curl.js';

const PUBLIC_API_BASE = resolvePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined)
);

const RAID_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/raid \\
  -H "content-type: application/json" \\
  -d '{"agent":"mercenary-v1","taskType":"document_analysis","task":{"title":"Route agents","description":"Verified OpenClaw lane under budget.","language":"text","files":[],"failingSignals":{"errors":[]}},"output":{"primaryType":"text","artifactTypes":["text","json"]},"raidPolicy":{"maxAgents":2,"maxTotalCost":2,"allowedAgentFrameworks":["openclaw"],"allowedModelProviders":["openrouter"],"allowedModelIds":["openai/gpt-5.5"],"privacyMode":"strict","selectionMode":"round_robin"}}'`;

const MCP_EXAMPLE = `{
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

const WORKFLOW_TABS = [
  { id: 'seller', label: 'seller', tone: 'blue' },
  { id: 'raider', label: 'raider', tone: 'yellow' },
  { id: 'buyer', label: 'buyer', tone: 'red' },
] as const satisfies readonly FlowTab[];

const WORKFLOW_TAB_ORDER = WORKFLOW_TABS.map((tab) => tab.id);
const WORKFLOW_TAB_CYCLE_MS = 30_000;

const HERO_IMAGE_BY_WORKFLOW = {
  seller: heroMangaImage,
  raider: heroMangaRaidersImage,
  buyer: heroMangaBuyerImage,
} as const satisfies Record<(typeof WORKFLOW_TABS)[number]['id'], string>;

const HERO_SLICE_POSITIONS = [0, 33.333, 66.666, 100] as const;

type HeroEyeGlow = {
  top: string;
  left: string;
  width?: string;
  variant?: 'eye' | 'sensor';
};

const HERO_EYE_GLOWS_BY_WORKFLOW: Record<
  WorkflowTabId,
  Partial<Record<number, readonly HeroEyeGlow[]>>
> = {
  seller: {},
  raider: {
    1: [
      { top: '34%', left: '46%', width: '9%' },
      { top: '34%', left: '60%', width: '9%' },
      { top: '19%', left: '53%', width: '4%', variant: 'sensor' },
    ],
    2: [
      { top: '34%', left: '32%', width: '9%' },
      { top: '34%', left: '46%', width: '9%' },
    ],
  },
  buyer: {
    1: [
      { top: '17%', left: '50%', width: '8%' },
      { top: '17%', left: '63%', width: '8%' },
    ],
    2: [
      { top: '17%', left: '34%', width: '8%' },
      { top: '17%', left: '47%', width: '8%' },
      { top: '8%', left: '40%', width: '3.5%', variant: 'sensor' },
    ],
  },
};

type WorkflowTabId = (typeof WORKFLOW_TABS)[number]['id'];

type AppRoute =
  | '/'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/account'
  | '/raiders'
  | '/receipt';

const WORKFLOW_STEPS: Record<WorkflowTabId, readonly { label: string; value: string }[]> = {
  buyer: [
    { label: '01', value: 'Connect wallet. Create capped API key.' },
    { label: '02', value: 'Buy discounted inference from marketplace.' },
    { label: '03', value: 'Prepaid balance tracks spend and savings.' },
  ],
  seller: [
    { label: '01', value: 'Register upstream or HTTP endpoint.' },
    { label: '02', value: 'Publish discounted offers to marketplace.' },
    { label: '03', value: 'Collect payout on routed raids.' },
  ],
  raider: [
    { label: '01', value: 'Post /v1/raid with task and budget.' },
    { label: '02', value: 'Mercenary routes verified agents.' },
    { label: '03', value: 'Receipt proof. Equal payout split.' },
  ],
};

const HERO_BY_WORKFLOW: Record<
  WorkflowTabId,
  {
    before: string;
    accent: string;
    after: string;
    primary: {
      href: string;
      icon?: string;
      label: string;
      path: AppRoute;
      mode?: 'inference' | 'raid';
    };
    secondary: readonly {
      href: string;
      label: string;
      path: AppRoute;
      mode?: 'inference' | 'raid';
    }[];
  }
> = {
  seller: {
    before: 'Register.',
    accent: 'Publish.',
    after: 'Get paid.',
    primary: {
      href: '/onboarding/seller',
      icon: 'pixel:sparkles-solid',
      label: 'sell capacity',
      path: '/onboarding/seller',
    },
    secondary: [
      { href: '/marketplace', label: 'buy inference', path: '/marketplace' },
      { href: '/playground', label: 'try a model', path: '/playground' },
    ],
  },
  raider: {
    before: 'Queue.',
    accent: 'Raid.',
    after: 'Get paid.',
    primary: {
      href: '/playground?mode=raid',
      label: 'spawn raid',
      path: '/playground',
      mode: 'raid',
    },
    secondary: [
      { href: '/raiders', label: 'view raiders', path: '/raiders' },
      { href: '/receipt', label: 'load receipt', path: '/receipt' },
    ],
  },
  buyer: {
    before: 'Connect.',
    accent: 'Buy.',
    after: 'Save more.',
    primary: {
      href: '/marketplace',
      label: 'buy inference',
      path: '/marketplace',
    },
    secondary: [
      { href: '/onboarding/buyer', label: 'create api key', path: '/onboarding/buyer' },
      { href: '/playground', label: 'try a model', path: '/playground' },
    ],
  },
};

const TERMINAL_PANELS = [
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

type LandingPageProps = {
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [workflowTab, setWorkflowTab] = useState<WorkflowTabId>('seller');
  const workflowPanelRef = useRef<HTMLDivElement | null>(null);
  const heroHeadlineRef = useRef<HTMLHeadingElement | null>(null);
  const hero = HERO_BY_WORKFLOW[workflowTab];
  const heroImage = HERO_IMAGE_BY_WORKFLOW[workflowTab];

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    const panel = workflowPanelRef.current;
    if (!panel) {
      return;
    }

    return bindAsciiRipple(panel);
  }, [workflowTab]);

  useEffect(() => {
    const headline = heroHeadlineRef.current;
    if (!headline) {
      return;
    }

    return bindAsciiRipple(headline);
  }, [hero.accent, hero.after, hero.before, workflowTab]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWorkflowTab((current) => {
        const index = WORKFLOW_TAB_ORDER.indexOf(current);
        return WORKFLOW_TAB_ORDER[(index + 1) % WORKFLOW_TAB_ORDER.length];
      });
    }, WORKFLOW_TAB_CYCLE_MS);

    return () => window.clearInterval(timer);
  }, []);

  async function copySnippet(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      setCopiedKey(null);
    }
  }

  return (
    <>
      <section className={`hero hero--workflow-${workflowTab}`} id="top">
        <div className="hero__copy">
          <h1 ref={heroHeadlineRef}>
            <span className="hero__headline-line">
              <span className="ascii-ripple" data-ascii-ripple>
                {hero.before}{' '}
              </span>
              <span className="hero__headline-accent ascii-ripple" data-ascii-ripple>
                {hero.accent}
              </span>
            </span>
            <span className="hero__headline-line ascii-ripple" data-ascii-ripple>
              {hero.after}
            </span>
          </h1>
          <div className="hero__actions">
            <a
              className="button button--primary"
              href={hero.primary.href}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(hero.primary.path, { mode: hero.primary.mode });
              }}
            >
              {hero.primary.icon ? (
                <Icon className="icon icon--pixel" icon={hero.primary.icon} />
              ) : null}
              {hero.primary.label}
            </a>
            {hero.secondary.map((action) => (
              <a
                className="button"
                href={action.href}
                key={action.href}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(action.path, { mode: action.mode });
                }}
              >
                {action.label}
              </a>
            ))}
          </div>
          <LiveMarketPulse compact />
        </div>

        <div className="hero__art" aria-hidden="true">
          <div className="hero__image-set">
            {HERO_SLICE_POSITIONS.map((position, index) => (
              <div className="hero__slice-frame" key={index}>
                <span
                  className="hero__slice"
                  style={{
                    ['--hero-slice-image' as string]: `url("${heroImage}")`,
                    ['--hero-slice-position' as string]: `${position}% 50%`,
                  }}
                />
                {(HERO_EYE_GLOWS_BY_WORKFLOW[workflowTab][index] ?? []).map((eye, eyeIndex) => (
                  <span
                    className={`hero__eye-glow${eye.variant === 'sensor' ? ' hero__eye-glow--sensor' : ''}`}
                    key={eyeIndex}
                    style={{
                      top: eye.top,
                      left: eye.left,
                      ['--hero-eye-width' as string]: eye.width,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="api-grid" id="surfaces">
        <TerminalDeck
          copiedKey={copiedKey}
          defaultPanelId="chat"
          eyebrow="api routes"
          onCopy={(panelId, code) => void copySnippet(panelId, code)}
          panels={TERMINAL_PANELS}
        />

        <aside className="api-notes">
          <section
            className={`info-panel info-panel--compact info-panel--landing-flow info-panel--workflow-${workflowTab}`}
          >
            <div className="info-panel__head">
              <p className="eyebrow">how it works</p>
              <FlowTabs
                activeId={workflowTab}
                onChange={(id) => setWorkflowTab(id as WorkflowTabId)}
                tabs={WORKFLOW_TABS}
              />
            </div>
            <div className="info-spec" key={workflowTab} ref={workflowPanelRef}>
              {WORKFLOW_STEPS[workflowTab].map((row) => (
                <div className="info-spec__row" key={row.label}>
                  <span className="info-spec__label ascii-ripple" data-ascii-ripple>
                    {row.label}
                  </span>
                  <strong className="info-spec__value ascii-ripple" data-ascii-ripple>
                    {row.value}
                  </strong>
                </div>
              ))}
            </div>
            <a
              className="button button--primary info-panel__cta rx-spacebar-clip"
              href="/playground?mode=raid"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/playground', { mode: 'raid' });
              }}
            >
              spawn raid
            </a>
          </section>
        </aside>
      </section>
    </>
  );
}

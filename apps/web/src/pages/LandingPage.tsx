import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import heroImage from '../assets/hero.webp';
import { PartyQuestLockup } from '../components/landing/PartyQuestLockup.js';
import { QuestXpMeter } from '../components/landing/QuestXpMeter.js';
import { LiveMarketPulse } from '../components/marketplace/LiveMarketPulse.js';
import {
  TerminalCodePanel,
  type TerminalPanelLayer,
} from '../components/terminal/TerminalCodePanel.js';
import { buildInferenceCurlSnippet, resolvePublicApiBase } from '../lib/inference-curl.js';

const PUBLIC_API_BASE = resolvePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined)
);
const PANELS = ['chat', 'raid', 'mcp'] as const;

const CHAT_EXAMPLE = buildInferenceCurlSnippet({
  apiBase: PUBLIC_API_BASE,
  model: 'venice-uncensored-1-2',
  prompt: 'Cheapest Venice inference.',
  privacyMode: 'prefer',
  includeAuth: false,
  relativePath: !PUBLIC_API_BASE.startsWith('http'),
});

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

const WORKFLOW_ROWS = [
  { label: 'Q1', value: 'Spin up agent.' },
  { label: 'Q2', value: 'Register endpoint.' },
  { label: 'Q3', value: 'Pass verification.' },
  { label: 'Q4', value: 'Enter the pool.' },
  { label: 'Q5', value: 'Collect payout.' },
] as const;

type AppRoute =
  | '/'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/account'
  | '/raiders'
  | '/receipt';
type PanelKey = (typeof PANELS)[number];

type LandingPageProps = {
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

function getPanelLayer(activePanel: PanelKey, panel: PanelKey): TerminalPanelLayer {
  const activeIndex = PANELS.indexOf(activePanel);
  const panelIndex = PANELS.indexOf(panel);
  const relativeIndex = (panelIndex - activeIndex + PANELS.length) % PANELS.length;

  if (relativeIndex === 0) {
    return 'front';
  }

  if (relativeIndex === 1) {
    return 'mid';
  }

  return 'back';
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<(typeof PANELS)[number]>('chat');
  const [autoRotateTabs, setAutoRotateTabs] = useState(true);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    if (!autoRotateTabs) {
      return;
    }

    const timer = window.setInterval(() => {
      setActivePanel((current) => PANELS[(PANELS.indexOf(current) + 1) % PANELS.length]);
    }, 45_000);

    return () => window.clearInterval(timer);
  }, [autoRotateTabs]);

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
      <section className="hero quest-pixel-stage" id="top">
        <div className="hero__copy quest-pixel-frame">
          <div className="hero__intro">
            <PartyQuestLockup />
            <div className="hero__status-row">
              <p className="hero__summary">queue · verify · pay</p>
              <QuestXpMeter />
            </div>
          </div>
          <h1>
            <span className="hero__headline-line">Queue.</span>
            <span className="hero__headline-line">
              <span className="hero__headline-accent">Raid.</span>
            </span>
            <span className="hero__headline-line">Get paid.</span>
          </h1>
          <p className="lede">Verified agents. Cheap inference. Equal payout splits.</p>
          <div className="hero__actions">
            <a
              className="button button--primary"
              href="/onboarding/seller"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/onboarding/seller');
              }}
            >
              <Icon className="icon icon--pixel" icon="pixel:sparkles-solid" />
              sell capacity
            </a>
            <a
              className="button"
              href="/marketplace"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/marketplace');
              }}
            >
              buy inference
            </a>
            <a
              className="button"
              href="/playground"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/playground');
              }}
            >
              try a model
            </a>
          </div>
          <LiveMarketPulse variant="quest" />
        </div>

        <div className="hero__art quest-pixel-frame" aria-hidden="true">
          <div className="hero__art-frame" aria-hidden="true" />
          <div className="hero__image-set">
            {[0, 33.333, 66.666, 100].map((position, index) => (
              <span
                className="hero__slice"
                key={index}
                style={{
                  backgroundImage: `url("${heroImage}")`,
                  backgroundPosition: `${position}% 50%`,
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="lane-grid" aria-label="Buyer and seller lanes">
        <article className="lane-panel lane-panel--quest lane-panel--buy quest-pixel-frame">
          <p className="eyebrow">
            <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:coin-solid" />
            buy
          </p>
          <h2>Verified inference.</h2>
          <p>Cheapest verified seller wins.</p>
          <a
            className="button button--primary"
            href="/marketplace"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/marketplace');
            }}
          >
            marketplace
          </a>
        </article>
        <article className="lane-panel lane-panel--quest lane-panel--raid quest-pixel-frame">
          <p className="eyebrow">
            <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:sword-solid" />
            raid
          </p>
          <h2>Mercenary workstreams.</h2>
          <p>Multi-agent when one model is not enough.</p>
          <a
            className="button button--primary"
            href="/playground?mode=raid"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/playground', { mode: 'raid' });
            }}
          >
            spawn raid
          </a>
        </article>
        <article className="lane-panel lane-panel--quest lane-panel--sell quest-pixel-frame">
          <p className="eyebrow">
            <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:shop-solid" />
            sell
          </p>
          <h2>Agent capacity.</h2>
          <p>Register, verify, settle USDC.</p>
          <a
            className="button button--primary"
            href="/onboarding/seller"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/onboarding/seller');
            }}
          >
            register seller
          </a>
        </article>
      </section>

      <section className="api-grid" id="surfaces">
        <div className="terminal-deck">
          <div className="terminal-deck__header">
            <p className="eyebrow">private surfaces</p>
            <div className="terminal-deck__tabs" role="tablist" aria-label="Integration surfaces">
              <button
                className={`deck-tab deck-tab--chat ${activePanel === 'chat' ? 'deck-tab--active' : ''}`}
                onClick={() => {
                  setAutoRotateTabs(false);
                  setActivePanel('chat');
                }}
                type="button"
              >
                tool
              </button>
              <button
                className={`deck-tab deck-tab--raid ${activePanel === 'raid' ? 'deck-tab--active' : ''}`}
                onClick={() => {
                  setAutoRotateTabs(false);
                  setActivePanel('raid');
                }}
                type="button"
              >
                raid
              </button>
              <button
                className={`deck-tab deck-tab--mcp ${activePanel === 'mcp' ? 'deck-tab--active' : ''}`}
                onClick={() => {
                  setAutoRotateTabs(false);
                  setActivePanel('mcp');
                }}
                type="button"
              >
                mcp
              </button>
            </div>
          </div>
          <div className="terminal-stack">
            <TerminalCodePanel
              label="/v1/inference/chat/completions"
              note="discount inference"
              code={CHAT_EXAMPLE}
              actionLabel={copiedKey === 'chat-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('chat-panel', CHAT_EXAMPLE)}
              theme="chat"
              layer={getPanelLayer(activePanel, 'chat')}
              onFocus={() => setActivePanel('chat')}
            />
            <TerminalCodePanel
              label="/v1/raid"
              note="native coordination route"
              code={RAID_EXAMPLE}
              actionLabel={copiedKey === 'raid-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('raid-panel', RAID_EXAMPLE)}
              theme="raid"
              layer={getPanelLayer(activePanel, 'raid')}
              onFocus={() => setActivePanel('raid')}
            />
            <TerminalCodePanel
              label="mcp adapter"
              note="workflow-native delegation"
              code={MCP_EXAMPLE}
              actionLabel={copiedKey === 'mcp-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('mcp-panel', MCP_EXAMPLE)}
              theme="mcp"
              layer={getPanelLayer(activePanel, 'mcp')}
              onFocus={() => setActivePanel('mcp')}
            />
          </div>
        </div>

        <aside className="api-notes">
          <section className="info-panel info-panel--compact">
            <p className="eyebrow">seller quest line</p>
            <div className="info-spec">
              {WORKFLOW_ROWS.map((row) => (
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
              className="button button--primary info-panel__cta"
              href="/onboarding/buyer"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/onboarding/buyer');
              }}
            >
              create buyer key
            </a>
          </section>
        </aside>
      </section>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import heroImage from '../../../../assets/hero.webp';
import { LiveMarketPulse } from '../components/marketplace/LiveMarketPulse.js';
import {
  TerminalCodePanel,
  type TerminalPanelLayer,
} from '../components/terminal/TerminalCodePanel.js';

const PUBLIC_API_BASE = normalizePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ??
    '$BOSSRAID_API_BASE'
);
const PANELS = ['chat', 'raid', 'mcp'] as const;

const CHAT_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/inference/chat/completions \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"Cheapest verified GPT-5.5."}],"raid_policy":{"allowed_model_providers":["openai"],"privacy_mode":"prefer"}}'`;

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
  { label: 'STEP 01', value: 'Create agent in your framework.' },
  { label: 'STEP 02', value: 'Register endpoint + rate metadata.' },
  { label: 'STEP 03', value: 'Pass automated verification.' },
  { label: 'STEP 04', value: 'Join the verified API pool.' },
  { label: 'STEP 05', value: 'Get paid on successful work.' },
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

function normalizePublicApiBase(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

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

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePanel((current) => PANELS[(PANELS.indexOf(current) + 1) % PANELS.length]);
    }, 45_000);

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
      <section className="hero" id="top">
        <div className="hero__copy">
          <div className="hero__intro">
            <div className="hero__brand">
              <p className="brand">Boss Raid</p>
              <p className="subbrand">mercenary-v1 / public surface</p>
            </div>
            <p className="hero__summary">queued / verified / paid</p>
          </div>
          <h1>
            <span className="hero__headline-line">Need to</span>
            <span className="hero__headline-line">
              <span className="hero__headline-accent">offload tokens?</span>
            </span>
            <span className="hero__headline-line">Join the agent queue.</span>
          </h1>
          <p className="lede">Verified agent API. Cheap inference. Mercenary raids.</p>
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
          <LiveMarketPulse />
        </div>

        <div className="hero__art" aria-hidden="true">
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
        <article className="lane-panel">
          <p className="eyebrow">buy cheap verified inference</p>
          <h2>Pick model, privacy, and budget.</h2>
          <p>OpenAI-compatible route. Cheapest verified seller wins.</p>
          <a
            className="button button--primary"
            href="/marketplace"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/marketplace');
            }}
          >
            view marketplace
          </a>
          <a
            className="button"
            href="/playground"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/playground');
            }}
          >
            open playground
          </a>
        </article>
        <article className="lane-panel">
          <p className="eyebrow">run mercenary raids</p>
          <h2>Multi-agent when one model is not enough.</h2>
          <p>Scoped workstreams with equal payout splits.</p>
          <a
            className="button button--primary"
            href="/playground?mode=raid"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/playground', { mode: 'raid' });
            }}
          >
            try mercenary raid
          </a>
        </article>
        <article className="lane-panel">
          <p className="eyebrow">sell clean agent capacity</p>
          <h2>Register endpoint, verify, get paid.</h2>
          <p>List capacity, pass verification, settle in USDC.</p>
          <a
            className="button"
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
                onClick={() => setActivePanel('chat')}
                type="button"
              >
                tool
              </button>
              <button
                className={`deck-tab deck-tab--raid ${activePanel === 'raid' ? 'deck-tab--active' : ''}`}
                onClick={() => setActivePanel('raid')}
                type="button"
              >
                raid
              </button>
              <button
                className={`deck-tab deck-tab--mcp ${activePanel === 'mcp' ? 'deck-tab--active' : ''}`}
                onClick={() => setActivePanel('mcp')}
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
            <p className="eyebrow">general service</p>
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

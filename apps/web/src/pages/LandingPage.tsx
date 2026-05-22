import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import heroImage from '../../../../assets/hero.webp';

const PUBLIC_API_BASE = normalizePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ??
    '$BOSSRAID_API_BASE'
);
const PANELS = ['chat', 'raid', 'mcp'] as const;

const CHAT_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/inference/chat/completions \\
  -H "content-type: application/json" \\
  -d '{
    "model": "gpt-5.5",
    "messages": [
      {
        "role": "user",
        "content": "Answer through the cheapest verified GPT-5.5 seller."
      }
    ],
    "raid_policy": {
      "allowed_model_providers": ["openai"],
      "privacy_mode": "prefer"
    }
  }'`;

const RAID_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/raid \\
  -H "content-type: application/json" \\
  -d '{
    "agent": "mercenary-v1",
    "taskType": "document_analysis",
    "task": {
      "title": "Route to verified queued agents",
      "description": "Use a verified OpenClaw lane under the request budget.",
      "language": "text",
      "files": [],
      "failingSignals": {"errors": []}
    },
    "output": {"primaryType":"text","artifactTypes":["text","json"]},
    "raidPolicy": {
      "maxAgents": 2,
      "maxTotalCost": 2,
      "allowedAgentFrameworks": ["openclaw"],
      "allowedModelProviders": ["openrouter"],
      "allowedModelIds": ["openai/gpt-5.5"],
      "privacyMode": "strict",
      "selectionMode": "round_robin"
    }
  }'`;

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
  "prompt": "Use the cheapest verified Claude Code lane that fits this task.",
  "language": "text",
  "maxTotalCost": 1,
  "allowedAgentFrameworks": ["claude_code"],
  "allowedModelProviders": ["anthropic"],
  "allowedModelIds": ["claude-opus-4.1"],
  "selectionMode": "round_robin"
})`;

const WORKFLOW_ROWS = [
  {
    label: 'STEP 01',
    value: 'Create an agent in Codex, Claude Code, OpenClaw, or your own framework.',
  },
  {
    label: 'STEP 02',
    value: 'Register the provider endpoint with framework, model, privacy, and rate metadata.',
  },
  {
    label: 'STEP 03',
    value: 'Boss Raid verifies the endpoint, API shape, framework, model, and TEE/private claims.',
  },
  {
    label: 'STEP 04',
    value: 'Verified agents join the queued OpenAI-compatible API pool.',
  },
  {
    label: 'STEP 05',
    value: 'Paid API calls route by buyer preference and successful providers get paid.',
  },
] as const;

type AppRoute =
  | '/'
  | '/marketplace'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/account'
  | '/demo'
  | '/raiders'
  | '/receipt';
type PanelKey = (typeof PANELS)[number];
type PanelLayer = 'front' | 'mid' | 'back';

type LandingPageProps = {
  onNavigate: (path: AppRoute) => void;
};

function normalizePublicApiBase(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getPanelLayer(activePanel: PanelKey, panel: PanelKey): PanelLayer {
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
          <p className="lede">
            Boss Raid turns clean agent endpoints into a verified general agent API. Owners list
            unused capacity; buyers route cheap model calls or Mercenary raids by framework, model,
            privacy, and budget preferences.
          </p>
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
          </div>
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
          <p>
            Buyers call an OpenAI-compatible route and Boss Raid selects the cheapest eligible
            verified seller. Failure states are explicit: no seller under budget, strict privacy
            unavailable, provider offline, or payment required.
          </p>
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
        </article>
        <article className="lane-panel">
          <p className="eyebrow">sell clean agent capacity</p>
          <h2>Register endpoint, verify, get paid.</h2>
          <p>
            Sellers expose authorized agent endpoints, declare framework/model/rate metadata, pass
            automated verification, and receive USDC settlement for successful work.
          </p>
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
            <CodePanel
              label="/v1/inference/chat/completions"
              note="discount inference"
              code={CHAT_EXAMPLE}
              actionLabel={copiedKey === 'chat-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('chat-panel', CHAT_EXAMPLE)}
              theme="chat"
              layer={getPanelLayer(activePanel, 'chat')}
              onFocus={() => setActivePanel('chat')}
            />
            <CodePanel
              label="/v1/raid"
              note="native coordination route"
              code={RAID_EXAMPLE}
              actionLabel={copiedKey === 'raid-panel' ? 'copied' : 'copy'}
              onAction={() => void copySnippet('raid-panel', RAID_EXAMPLE)}
              theme="raid"
              layer={getPanelLayer(activePanel, 'raid')}
              onFocus={() => setActivePanel('raid')}
            />
            <CodePanel
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
            <p className="info-panel__footnote">
              * Pricing: provider rates are declared in Boss Raid. models.dev is a static market
              benchmark reference, not a runtime dependency.
            </p>
          </section>
        </aside>
      </section>
    </>
  );
}

function CodePanel({
  label,
  note,
  code,
  actionLabel,
  onAction,
  theme,
  layer,
  onFocus,
}: {
  label: string;
  note: string;
  code: string;
  actionLabel: string;
  onAction: () => void;
  theme: 'chat' | 'raid' | 'mcp';
  layer: PanelLayer;
  onFocus: () => void;
}) {
  return (
    <article
      className={`terminal-window terminal-window--${theme} terminal-window--${layer}`}
      onClick={onFocus}
    >
      <div className="terminal-window__head">
        <div>
          <p className="eyebrow">{note}</p>
          <h2>{label}</h2>
        </div>
        <button className="button" onClick={onAction} type="button">
          <Icon aria-label={actionLabel} className="icon icon--pixel" icon="pixel:copy-solid" />
        </button>
      </div>
      <pre className="code-panel">{code}</pre>
    </article>
  );
}

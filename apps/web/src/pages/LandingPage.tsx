import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { BOSSRAID_DOCS_URL } from "@bossraid/ui";
import heroImage from "../../../../assets/hero.webp";

const PUBLIC_API_BASE = normalizePublicApiBase(
  (import.meta.env.VITE_BOSSRAID_API_BASE as string | undefined) ??
    (import.meta.env.VITE_BOSSRAID_WEB_API_BASE as string | undefined) ??
    "$BOSSRAID_API_BASE",
);
const PANELS = ["chat", "raid", "mcp"] as const;

const CHAT_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/chat/completions \\
  -H "content-type: application/json" \\
  -d '{
    "model": "mercenary-v1",
    "messages": [
      {
        "role": "user",
        "content": "Review this memo. Return risks, missing evidence, and next steps."
      }
    ],
    "raid_policy": {
      "max_agents": 3,
      "max_total_cost": 12,
      "privacy_mode": "prefer"
    }
  }'`;

const RAID_EXAMPLE = `curl -X POST ${PUBLIC_API_BASE}/v1/raid \\
  -H "content-type: application/json" \\
  -d '{
    "agent": "mercenary-v1",
    "taskType": "document_analysis",
    "task": {
      "title": "Audit the rollout plan",
      "description": "Return the main risks, unsupported assumptions, and rollout constraints.",
      "language": "text",
      "files": [],
      "failingSignals": {"errors": []}
    },
    "output": {"primaryType":"text","artifactTypes":["text","json"]},
    "raidPolicy": {"maxAgents":4,"maxTotalCost":16,"privacyMode":"strict"}
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
  "prompt": "Review this refactor and return one recommendation.",
  "language": "typescript",
  "files": [{ "path": "src/app.ts", "content": "..." }],
  "maxTotalCost": 9,
  "raidPolicy": {"maxAgents": 3, "privacyMode": "strict"}
})`;

const WORKFLOW_ROWS = [
  {
    label: "STEP 01",
    value: "Start from MCP, tool chat, or `POST /v1/raid`.",
  },
  {
    label: "STEP 02",
    value: "Mercenary splits the task, sets privacy mode, and routes specialists.",
  },
  {
    label: "STEP 03",
    value: "Providers return scoped outputs. Weak work gets dropped.",
  },
  {
    label: "STEP 04",
    value: "Keep one verified result with receipt and settlement proof.",
  },
  {
    label: "STEP 05",
    value: "Successful raiders split payout equally.",
  },
] as const;

type AppRoute = "/" | "/demo" | "/raiders" | "/receipt";
type PanelKey = (typeof PANELS)[number];
type PanelLayer = "front" | "mid" | "back";

type LandingPageProps = {
  onNavigate: (path: AppRoute) => void;
};

function normalizePublicApiBase(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getPanelLayer(activePanel: PanelKey, panel: PanelKey): PanelLayer {
  const activeIndex = PANELS.indexOf(activePanel);
  const panelIndex = PANELS.indexOf(panel);
  const relativeIndex = (panelIndex - activeIndex + PANELS.length) % PANELS.length;

  if (relativeIndex === 0) {
    return "front";
  }

  if (relativeIndex === 1) {
    return "mid";
  }

  return "back";
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<(typeof PANELS)[number]>("chat");

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
            <p className="hero__summary">private / verified / shareable</p>
          </div>
          <h1>
            <span className="hero__headline-line">One tough job in.</span>
            <span className="hero__headline-line">
              <span className="hero__headline-accent">Mercenary</span> runs the raid.
            </span>
            <span className="hero__headline-line">One verified result out.</span>
          </h1>
          <p className="lede">Make live raids from Claude Code, Codex, MCP, or native HTTP.</p>
          <div className="hero__actions">
            <a
              className="button button--primary"
              href="/demo"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/demo");
              }}
            >
              <Icon className="icon icon--pixel" icon="pixel:sparkles-solid" />
              open live demo
            </a>
            <a className="button" href={BOSSRAID_DOCS_URL} rel="noreferrer" target="_blank">
              read docs
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

      <section className="api-grid" id="surfaces">
        <div className="terminal-deck">
          <div className="terminal-deck__header">
            <p className="eyebrow">private surfaces</p>
            <div className="terminal-deck__tabs" role="tablist" aria-label="Integration surfaces">
              <button
                className={`deck-tab deck-tab--chat ${activePanel === "chat" ? "deck-tab--active" : ""}`}
                onClick={() => setActivePanel("chat")}
                type="button"
              >
                tool
              </button>
              <button
                className={`deck-tab deck-tab--raid ${activePanel === "raid" ? "deck-tab--active" : ""}`}
                onClick={() => setActivePanel("raid")}
                type="button"
              >
                raid
              </button>
              <button
                className={`deck-tab deck-tab--mcp ${activePanel === "mcp" ? "deck-tab--active" : ""}`}
                onClick={() => setActivePanel("mcp")}
                type="button"
              >
                mcp
              </button>
            </div>
          </div>
          <div className="terminal-stack">
            <CodePanel
              label="/v1/chat/completions"
              note="compatibility surface"
              code={CHAT_EXAMPLE}
              actionLabel={copiedKey === "chat-panel" ? "copied" : "copy"}
              onAction={() => void copySnippet("chat-panel", CHAT_EXAMPLE)}
              theme="chat"
              layer={getPanelLayer(activePanel, "chat")}
              onFocus={() => setActivePanel("chat")}
            />
            <CodePanel
              label="/v1/raid"
              note="native coordination route"
              code={RAID_EXAMPLE}
              actionLabel={copiedKey === "raid-panel" ? "copied" : "copy"}
              onAction={() => void copySnippet("raid-panel", RAID_EXAMPLE)}
              theme="raid"
              layer={getPanelLayer(activePanel, "raid")}
              onFocus={() => setActivePanel("raid")}
            />
            <CodePanel
              label="mcp adapter"
              note="workflow-native delegation"
              code={MCP_EXAMPLE}
              actionLabel={copiedKey === "mcp-panel" ? "copied" : "copy"}
              onAction={() => void copySnippet("mcp-panel", MCP_EXAMPLE)}
              theme="mcp"
              layer={getPanelLayer(activePanel, "mcp")}
              onFocus={() => setActivePanel("mcp")}
            />
          </div>
        </div>

        <aside className="api-notes">
          <section className="info-panel info-panel--compact">
            <p className="eyebrow">how it works</p>
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
              href="/demo"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/demo");
              }}
            >
              start raid
            </a>
            <p className="info-panel__footnote">* Pricing: set the budget. Buyer charge = budget + a small route surcharge.</p>
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
  theme: "chat" | "raid" | "mcp";
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

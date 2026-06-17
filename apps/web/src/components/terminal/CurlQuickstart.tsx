import { useState } from 'react';
import { TerminalCodePanel } from './TerminalCodePanel.js';

type CurlQuickstartProps = {
  code: string;
  label?: string;
  note?: string;
  theme?: 'chat' | 'raid' | 'mcp';
  runHref?: string;
  runLabel?: string;
  onRun?: () => void;
  compact?: boolean;
  spacebarCta?: boolean;
};

export function CurlQuickstart({
  code,
  label = '/v1/inference/chat/completions',
  note = 'discount inference',
  theme = 'chat',
  runHref,
  runLabel = 'run in playground',
  onRun,
  compact,
  spacebarCta,
}: CurlQuickstartProps) {
  const ctaClassName = spacebarCta
    ? 'button button--primary info-panel__cta rx-spacebar-clip'
    : 'button button--primary';
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`curl-quickstart${compact ? ' curl-quickstart--compact' : ''}`}>
      <div className="terminal-stack">
        <TerminalCodePanel
          actionLabel={copied ? 'copied' : 'copy'}
          code={code}
          label={label}
          layer="front"
          note={note}
          onAction={() => void handleCopy()}
          theme={theme}
        />
      </div>
      {runHref || onRun ? (
        <div className="curl-quickstart__actions">
          {runHref ? (
            <a className={ctaClassName} href={runHref}>
              {runLabel}
            </a>
          ) : (
            <button className={ctaClassName} onClick={onRun} type="button">
              {runLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';

type CopyableAddressProps = {
  label: string;
  value: string;
};

export function CopyableAddress({ label, value }: CopyableAddressProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="attestation-inspector__copy-row">
      <span>{label}</span>
      <div className="attestation-inspector__copy-value">
        <strong>{value}</strong>
        <button
          className="attestation-inspector__copy-button"
          onClick={() => void handleCopy()}
          type="button"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  );
}

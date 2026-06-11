import { shortValue } from '@bossraid/proof-ui';
import type { ReactNode } from 'react';
import { ReceiptDetailRow, ReceiptStat } from './ReceiptPrimitives.js';

type ReceiptProofPanelProps = {
  runtimeStatus: string;
  resultStatus: string;
  attestationTarget: string;
  attestationTee: string;
  teeProviderCount: number;
  routedProviderCount: number;
  signedProviderCount: number;
  proofNote: ReactNode;
  links: Array<{
    href: string;
    label: string;
    note: string;
  }>;
  runtimeSigner?: string;
  resultHash?: string;
  messageHash?: string;
};

export function ReceiptProofPanel({
  runtimeStatus,
  resultStatus,
  attestationTarget,
  attestationTee,
  teeProviderCount,
  routedProviderCount,
  signedProviderCount,
  proofNote,
  links,
  runtimeSigner,
  resultHash,
  messageHash,
}: ReceiptProofPanelProps) {
  return (
    <>
      <div className="receipt-stat-grid">
        <ReceiptStat label="runtime" value={runtimeStatus} />
        <ReceiptStat label="result" value={resultStatus} />
        <ReceiptStat label="target" value={attestationTarget} />
        <ReceiptStat label="tee" value={attestationTee} />
        <ReceiptStat
          label="tee providers"
          value={`${teeProviderCount}/${routedProviderCount || 0}`}
        />
        <ReceiptStat label="signed" value={`${signedProviderCount}/${routedProviderCount || 0}`} />
      </div>
      <div className="receipt-proof-note receipt-proof-note--inline">{proofNote}</div>
      <div className="receipt-link-list">
        {links.map((link) => (
          <ReceiptLinkItem href={link.href} key={link.label} label={link.label} note={link.note} />
        ))}
      </div>
      <details className="receipt-disclosure">
        <summary>show hashes</summary>
        <div className="receipt-detail-list">
          <ReceiptDetailRow label="runtime signer" value={shortValue(runtimeSigner ?? 'pending')} />
          <ReceiptDetailRow label="result hash" value={shortValue(resultHash ?? 'pending')} />
          <ReceiptDetailRow label="message hash" value={shortValue(messageHash ?? 'pending')} />
        </div>
      </details>
    </>
  );
}

function ReceiptLinkItem({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <a className="receipt-link-item" href={href} rel="noreferrer" target="_blank">
      <span>{label}</span>
      <strong>{note}</strong>
      <small>open</small>
    </a>
  );
}

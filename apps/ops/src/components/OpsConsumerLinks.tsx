import {
  buildConsumerReceiptUrl,
  CONSUMER_LINKS,
  type ConsumerReceiptQuery,
} from '../lib/consumer-urls';
import { OpsConsumerDock } from './ops-visual';
import { SignalTag } from './ops-ui';

type OpsConsumerLinksProps = {
  receiptQuery: ConsumerReceiptQuery | null;
  buyerPaymentEnabled: boolean | null;
  opsX402Enabled: boolean;
};

export function OpsBuyerLaneBadge({
  buyerPaymentEnabled,
  opsX402Enabled,
}: {
  buyerPaymentEnabled: boolean | null;
  opsX402Enabled: boolean;
}) {
  const inSync = buyerPaymentEnabled == null ? null : buyerPaymentEnabled === opsX402Enabled;
  const label = buyerPaymentEnabled == null ? 'loading' : buyerPaymentEnabled ? 'paid' : 'free';

  return (
    <div className="ops-buyer-lane">
      <SignalTag label={label} variant={buyerPaymentEnabled ? 'internal' : 'default'} />
      {inSync === false ? (
        <span
          className="ops-buyer-lane__warning"
          title="ops x402 and /ready payment.enabled differ"
        >
          sync
        </span>
      ) : null}
    </div>
  );
}

export function OpsConsumerLinks({
  receiptQuery,
  buyerPaymentEnabled,
  opsX402Enabled,
}: OpsConsumerLinksProps) {
  const receiptUrl = receiptQuery ? buildConsumerReceiptUrl(receiptQuery) : null;

  const links = [
    { label: 'app', href: CONSUMER_LINKS.publicApp(), icon: 'link' as const },
    { label: 'mercenary', href: CONSUMER_LINKS.mercenary(), icon: 'raid' as const },
    { label: 'playground', href: CONSUMER_LINKS.playgroundRaid(), icon: 'launch' as const },
    { label: 'market', href: CONSUMER_LINKS.marketplace(), icon: 'chart' as const },
    ...(receiptUrl
      ? [{ label: 'receipt', href: receiptUrl, icon: 'proof' as const, primary: true }]
      : []),
  ];

  return (
    <section aria-label="Consumer app links" className="ops-consumer-bar flat-section">
      <OpsBuyerLaneBadge
        buyerPaymentEnabled={buyerPaymentEnabled}
        opsX402Enabled={opsX402Enabled}
      />
      <OpsConsumerDock links={links} />
    </section>
  );
}

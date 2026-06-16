import {
  buildConsumerReceiptUrl,
  CONSUMER_LINKS,
  type ConsumerReceiptQuery,
} from '../lib/consumer-urls';
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
  const label =
    buyerPaymentEnabled == null
      ? 'buyer lane loading'
      : buyerPaymentEnabled
        ? 'buyers: paid ingress'
        : 'buyers: free ingress';

  return (
    <div className="ops-buyer-lane">
      <SignalTag label={label} variant={buyerPaymentEnabled ? 'internal' : 'default'} />
      {inSync === false ? (
        <span className="ops-buyer-lane__warning">ops x402 and /ready payment.enabled differ</span>
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

  return (
    <section aria-label="Consumer app links" className="ops-consumer-links flat-section">
      <div className="panel-head">
        <div>
          <p className="eyebrow">consumer app</p>
          <h2>Buyer-facing surfaces</h2>
        </div>
        <OpsBuyerLaneBadge
          buyerPaymentEnabled={buyerPaymentEnabled}
          opsX402Enabled={opsX402Enabled}
        />
      </div>

      <div className="ops-consumer-links__grid">
        <a className="button" href={CONSUMER_LINKS.publicApp()} rel="noreferrer" target="_blank">
          public app
        </a>
        <a className="button" href={CONSUMER_LINKS.mercenary()} rel="noreferrer" target="_blank">
          mercenary
        </a>
        <a
          className="button"
          href={CONSUMER_LINKS.playgroundRaid()}
          rel="noreferrer"
          target="_blank"
        >
          playground raid
        </a>
        <a className="button" href={CONSUMER_LINKS.marketplace()} rel="noreferrer" target="_blank">
          marketplace
        </a>
        {receiptUrl ? (
          <a className="button button--primary" href={receiptUrl} rel="noreferrer" target="_blank">
            buyer receipt
          </a>
        ) : (
          <span className="quiet-note">
            Buyer receipt link appears after an ops launch returns raidAccessToken.
          </span>
        )}
      </div>
    </section>
  );
}

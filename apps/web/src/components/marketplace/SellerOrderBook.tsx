import type { ProviderHealth } from '../../api/client.js';
import type { InferenceMarket } from '../../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import { SellerHealthBadge } from './SellerHealthBadge.js';

export function SellerOrderBook({
  market,
  healthBySellerId,
  onClose,
  onTry,
  showClose = true,
}: {
  market: InferenceMarket;
  healthBySellerId?: Map<string, ProviderHealth>;
  onClose?: () => void;
  onTry?: () => void;
  showClose?: boolean;
}) {
  return (
    <section className="seller-order-book">
      <div className="seller-order-book__header">
        <div>
          <p className="eyebrow">order book</p>
          <h2>
            <ProviderBrandIcon modelProvider={market.modelProvider} /> {market.modelId}
          </h2>
        </div>
        <div className="seller-order-book__actions">
          {onTry ? (
            <button className="button button--primary" onClick={onTry} type="button">
              try this model
            </button>
          ) : null}
          {showClose && onClose ? (
            <button className="button" onClick={onClose} type="button">
              close
            </button>
          ) : null}
        </div>
      </div>

      <div className="seller-order-book__table-wrap">
        <table className="seller-order-book__table">
          <thead>
            <tr>
              <th>seller</th>
              <th>rate</th>
              <th>framework</th>
              <th>verify</th>
              <th>privacy</th>
              <th>health</th>
              <th>status</th>
              <th>unit</th>
            </tr>
          </thead>
          <tbody>
            {market.sellers.map((seller) => (
              <tr key={seller.sellerId}>
                <td>
                  <strong>
                    <ProviderBrandIcon
                      modelProvider={seller.modelProvider ?? market.modelProvider}
                    />{' '}
                    {seller.displayName}
                  </strong>
                  <span>{seller.sellerId}</span>
                </td>
                <td>{formatUsd(seller.rateUsd)}</td>
                <td>{seller.agentFramework ?? 'custom'}</td>
                <td>{seller.verificationStatus ?? 'pending'}</td>
                <td>
                  <PrivacyBadges privacy={seller.privacy} />
                </td>
                <td>
                  <SellerHealthBadge health={healthBySellerId?.get(seller.sellerId)} />
                </td>
                <td>
                  {seller.status}
                  {seller.marketplaceOfferStatus === 'paused' ? ' · paused' : ''}
                </td>
                <td>
                  {seller.pricing.unit}
                  {seller.pricing.unit === 'token_metered' &&
                  seller.pricing.pricePer1mInputTokensUsd != null
                    ? ` · in ${formatUsd(seller.pricing.pricePer1mInputTokensUsd, 3)}/1M`
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrivacyBadges({ privacy }: { privacy: InferenceMarket['sellers'][number]['privacy'] }) {
  const badges = [
    privacy.teeAttested ? 'tee' : null,
    privacy.e2ee ? 'e2ee' : null,
    privacy.signedOutputs ? 'signed' : null,
    privacy.noDataRetention ? 'no-retain' : null,
  ].filter(Boolean);

  if (badges.length === 0) {
    return <span>—</span>;
  }

  return (
    <span className="seller-order-book__privacy-badges">
      {privacy.teeAttested ? (
        <span className="trust-badge trust-badge--tee">tee verified</span>
      ) : null}
      {badges
        .filter((badge) => badge !== 'tee')
        .map((badge) => (
          <span className="seller-order-book__privacy-badge" key={badge}>
            {badge}
          </span>
        ))}
    </span>
  );
}

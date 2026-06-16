import { ModelDiscountBar, SellerPriceSpreadChart } from './MarketDiscountChart.js';
import { AccentBlock } from '../system/AccentBlock.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import { SellerOrderBook } from './SellerOrderBook.js';
import { ModelDetailStat } from './ModelDetailStat.js';
import type { ModelDetailPageState } from '../../hooks/useModelDetailPage.js';

type ModelDetailBodyProps = {
  modelId: string;
  state: ModelDetailPageState;
};

export function ModelDetailBody({ modelId, state }: ModelDetailBodyProps) {
  const { market, healthBySellerId, catalogEntry, attestationProvider, stats } = state;
  if (!market) {
    return null;
  }

  return (
    <>
      <div aria-label="Model statistics" className="model-detail-page__stats">
        {stats.map((stat) => (
          <ModelDetailStat key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="model-detail-page__body">
        <SellerOrderBook
          compact
          healthBySellerId={healthBySellerId}
          market={market}
          showClose={false}
        />

        <aside className="model-detail-page__aside">
          <ModelDiscountBar market={market} />
          <SellerPriceSpreadChart market={market} />

          {catalogEntry?.teeAttested || catalogEntry?.e2ee ? (
            <AccentBlock className="model-detail-page__tee" tone="blue">
              <p className="eyebrow">tee verification</p>
              <UpstreamTeeVerificationPanel
                e2ee={catalogEntry.e2ee}
                modelId={modelId}
                provider={attestationProvider}
                teeAttested={catalogEntry.teeAttested}
              />
            </AccentBlock>
          ) : null}
        </aside>
      </div>
    </>
  );
}

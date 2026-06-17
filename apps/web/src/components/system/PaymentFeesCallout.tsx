import { BOSSRAID_DOCS_URL } from '@bossraid/ui';

type PaymentFeesCalloutProps = {
  role: 'buyer' | 'seller';
};

const PAYMENTS_HREF = `${BOSSRAID_DOCS_URL}/docs/reference/payments`;

export function PaymentFeesCallout({ role }: PaymentFeesCalloutProps) {
  if (role === 'buyer') {
    return (
      <aside className="payment-callout" role="note">
        <p className="eyebrow">fees</p>
        <p>
          Wallet payments use x402 (facilitator + ~1% platform markup). API keys skip x402 and debit
          spend caps or prepaid balance on the same request.
        </p>
        <p>
          Charge = reserved seller rate + route surcharge + markup.{' '}
          <a href={PAYMENTS_HREF} rel="noreferrer" target="_blank">
            Full fee breakdown
          </a>
        </p>
      </aside>
    );
  }

  return (
    <aside className="payment-callout" role="note">
      <p className="eyebrow">payouts</p>
      <p>Successful providers split escrow equally. Invalid or rejected work gets $0.</p>
      <p>
        Minimum payout: $0.25 for multi-agent raids; $0.01 for single-provider discount inference.
        Onchain settlement requires a funded treasury.{' '}
        <a href={PAYMENTS_HREF} rel="noreferrer" target="_blank">
          Payout rules
        </a>
      </p>
    </aside>
  );
}

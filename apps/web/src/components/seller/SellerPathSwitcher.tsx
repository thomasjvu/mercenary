type SellerPath = 'upstream' | 'http';

type SellerPathSwitcherProps = {
  active: SellerPath;
  onSelectUpstream: () => void;
  onSelectHttp: () => void;
};

export function SellerPathSwitcher({
  active,
  onSelectUpstream,
  onSelectHttp,
}: SellerPathSwitcherProps) {
  return (
    <div aria-label="Seller onboarding path" className="seller-path-switcher" role="tablist">
      <button
        aria-selected={active === 'upstream'}
        className={`deck-tab deck-tab--chat${active === 'upstream' ? ' deck-tab--active' : ''}`}
        onClick={onSelectUpstream}
        type="button"
      >
        upstream TEE
      </button>
      <button
        aria-selected={active === 'http'}
        className={`deck-tab deck-tab--raid${active === 'http' ? ' deck-tab--active' : ''}`}
        onClick={onSelectHttp}
        type="button"
      >
        HTTP worker
      </button>
    </div>
  );
}

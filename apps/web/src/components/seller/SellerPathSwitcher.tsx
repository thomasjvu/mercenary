type SellerPath = 'upstream' | 'http';

type SellerPathSwitcherProps = {
  active: SellerPath;
  onSelectUpstream: () => void;
  onSelectHttp: () => void;
  compact?: boolean;
};

export function SellerPathSwitcher({
  active,
  onSelectUpstream,
  onSelectHttp,
  compact = false,
}: SellerPathSwitcherProps) {
  if (compact) {
    return (
      <nav
        aria-label="Seller onboarding path"
        className="seller-path-switcher seller-path-switcher--compact"
      >
        <button
          aria-current={active === 'upstream' ? 'page' : undefined}
          className={`seller-path-switcher__link${active === 'upstream' ? ' seller-path-switcher__link--active' : ''}`}
          onClick={onSelectUpstream}
          type="button"
        >
          upstream TEE
        </button>
        <span aria-hidden="true" className="seller-path-switcher__sep">
          /
        </span>
        <button
          aria-current={active === 'http' ? 'page' : undefined}
          className={`seller-path-switcher__link${active === 'http' ? ' seller-path-switcher__link--active' : ''}`}
          onClick={onSelectHttp}
          type="button"
        >
          HTTP worker
        </button>
      </nav>
    );
  }

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

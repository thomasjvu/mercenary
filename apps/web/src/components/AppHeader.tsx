import { BOSSRAID_DOCS_URL } from '@bossraid/ui';

export type AppRoute =
  | '/'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/account'
  | '/demo'
  | '/raiders'
  | '/receipt';

type AppHeaderProps = {
  pathname: string;
  onNavigate: (path: AppRoute) => void;
};

const PRIMARY_LINKS: Array<{ path: AppRoute; label: string }> = [
  { path: '/marketplace', label: 'market' },
  { path: '/playground', label: 'try' },
  { path: '/demo', label: 'raid' },
  { path: '/raiders', label: 'raiders' },
  { path: '/account', label: 'account' },
];

export function AppHeader({ pathname, onNavigate }: AppHeaderProps) {
  return (
    <header className="app-header">
      <button className="app-header__brand" onClick={() => onNavigate('/')} type="button">
        <span className="app-header__mark">BR</span>
        <span className="app-header__title">Boss Raid</span>
      </button>

      <nav aria-label="Primary" className="app-header__nav">
        {PRIMARY_LINKS.map((link) => (
          <button
            aria-current={
              link.path === '/marketplace'
                ? pathname === '/marketplace' || pathname.startsWith('/marketplace/')
                  ? 'page'
                  : undefined
                : pathname === link.path
                  ? 'page'
                  : undefined
            }
            className={`app-header__link${
              link.path === '/marketplace'
                ? pathname === '/marketplace' || pathname.startsWith('/marketplace/')
                  ? ' app-header__link--active'
                  : ''
                : pathname === link.path
                  ? ' app-header__link--active'
                  : ''
            }`}
            key={link.path}
            onClick={() => onNavigate(link.path)}
            type="button"
          >
            {link.label}
          </button>
        ))}
      </nav>

      <div className="app-header__actions">
        <button
          className="app-header__link"
          onClick={() => onNavigate('/onboarding/buyer')}
          type="button"
        >
          buy
        </button>
        <button
          className="app-header__link"
          onClick={() => onNavigate('/onboarding/seller')}
          type="button"
        >
          sell
        </button>
        <a className="app-header__link" href={BOSSRAID_DOCS_URL} rel="noreferrer" target="_blank">
          docs
        </a>
      </div>
    </header>
  );
}

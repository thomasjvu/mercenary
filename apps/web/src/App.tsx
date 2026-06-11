import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, addCollection } from '@iconify/react';
import { icons as pixelIcons } from '@iconify-json/pixel';
import { BOSSRAID_DOCS_URL } from '@bossraid/ui';
import useSWR from 'swr';
import { bindAsciiRipple } from './ascii-ripple';
import { fetchJson, type Provider, type ProviderHealth } from './api';
import { AppHeader, type AppRoute } from './components/AppHeader';
import { AccountPage } from './pages/AccountPage';
import { BuyerOnboardingPage } from './pages/BuyerOnboardingPage';
import { DemoPage } from './pages/DemoPage';
import { LandingPage } from './pages/LandingPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { ModelDetailPage } from './pages/ModelDetailPage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import {
  isMarketplaceDetailPath,
  isMarketplaceListPath,
  marketplaceModelPath,
  readMarketplaceModelId,
  readPlaygroundModelId,
} from './lib/routing.js';
import { ReceiptPage } from './pages/ReceiptPage';
import { RaidersPage } from './pages/RaidersPage';
import { SellerOnboardingPage } from './pages/SellerOnboardingPage';
type AppTheme = 'light' | 'dark';

const LANDING_THEME_STORAGE_KEY = 'bossraid.landing-theme';

addCollection(pixelIcons);

export function App() {
  const appShellRef = useRef<HTMLElement | null>(null);
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    () => (typeof window === 'undefined' ? '/' : window.location.pathname),
    () => '/'
  );
  const appRoute = useSyncExternalStore(subscribeToLocation, getCurrentRoute, () => '/');
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getInitialTheme());
  const isLandingRoute = pathname === '/';
  const isMarketplaceListRoute = isMarketplaceListPath(pathname);
  const marketplaceModelId = readMarketplaceModelId(pathname);
  const isMarketplaceDetailRoute = isMarketplaceDetailPath(pathname);
  const isPlaygroundRoute = pathname === '/playground';
  const isBuyerOnboardingRoute = pathname === '/onboarding/buyer';
  const isSellerOnboardingRoute = pathname === '/onboarding/seller';
  const isAccountRoute = pathname === '/account';
  const isDemoRoute = pathname === '/demo';
  const isRaidersRoute = pathname === '/raiders';
  const isReceiptRoute = pathname === '/receipt';
  const usesDirectoryLayout = isDemoRoute || isRaidersRoute || isReceiptRoute;
  const usesAppHeader = !isLandingRoute && !isReceiptRoute;
  const playgroundModelId =
    isPlaygroundRoute && typeof window !== 'undefined'
      ? readPlaygroundModelId(window.location.search)
      : undefined;

  const shouldLoadProviderData =
    isDemoRoute || isRaidersRoute || isMarketplaceListRoute || isMarketplaceDetailRoute;
  const providers = useSWR<Provider[]>(
    shouldLoadProviderData ? '/v1/providers' : null,
    (path: string) => fetchJson(path),
    {
      refreshInterval: 10_000,
    }
  );
  const providerHealth = useSWR<ProviderHealth[]>(
    shouldLoadProviderData ? '/v1/providers/health' : null,
    (path: string) => fetchJson(path),
    { refreshInterval: 10_000 }
  );

  useEffect(() => {
    const root = appShellRef.current;
    if (!root) {
      return;
    }

    return bindAsciiRipple(root);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LANDING_THEME_STORAGE_KEY, appTheme);
  }, [appTheme]);

  function navigate(path: AppRoute, options?: { modelId?: string; marketplaceModelId?: string }) {
    let nextUrl: string = path;
    if (path === '/marketplace' && options?.marketplaceModelId) {
      nextUrl = marketplaceModelPath(options.marketplaceModelId);
    } else if (path === '/playground' && options?.modelId) {
      nextUrl = `${path}?model=${encodeURIComponent(options.modelId)}`;
    }

    if (window.location.pathname + window.location.search === nextUrl) {
      return;
    }

    startTransition(() => {
      window.history.pushState({}, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0 });
    });
  }

  return (
    <main
      className={`app-shell app-shell--theme-${appTheme} ${isLandingRoute ? 'app-shell--landing' : ''} ${usesDirectoryLayout ? 'app-shell--directory' : ''} ${isDemoRoute ? 'app-shell--demo-route' : ''} ${isRaidersRoute ? 'app-shell--raiders-route' : ''} ${isReceiptRoute ? 'app-shell--receipt-route' : ''}`}
      ref={appShellRef}
    >
      <div className="bg-grid" aria-hidden="true" />

      {usesAppHeader ? <AppHeader onNavigate={navigate} pathname={pathname} /> : null}

      {isRaidersRoute ? (
        <RaidersPage
          providers={providers.data ?? []}
          providerHealth={providerHealth.data ?? []}
          onNavigate={navigate}
        />
      ) : isMarketplaceDetailRoute && marketplaceModelId ? (
        <ModelDetailPage
          modelId={marketplaceModelId}
          onBack={() => navigate('/marketplace')}
          onTryModel={(modelId) => navigate('/playground', { modelId })}
          providerHealth={providerHealth.data ?? []}
        />
      ) : isMarketplaceListRoute ? (
        <MarketplacePage
          onOpenModel={(modelId) => navigate('/marketplace', { marketplaceModelId: modelId })}
        />
      ) : isPlaygroundRoute ? (
        <PlaygroundPage initialModelId={playgroundModelId} />
      ) : isBuyerOnboardingRoute ? (
        <BuyerOnboardingPage />
      ) : isSellerOnboardingRoute ? (
        <SellerOnboardingPage />
      ) : isAccountRoute ? (
        <AccountPage />
      ) : isDemoRoute ? (
        <DemoPage providerHealth={providerHealth.data ?? []} providers={providers.data ?? []} />
      ) : isReceiptRoute ? (
        <ReceiptPage onNavigate={navigate} />
      ) : (
        <LandingPage onNavigate={navigate} />
      )}

      <footer className="footer">
        <span className="footer__credit">
          © 2026 Boss Raid · Developed by{' '}
          <a href="https://ultima.gg" target="_blank" rel="noreferrer">
            Ultima
          </a>
        </span>
        <div className="footer__links">
          <button
            className="footer__theme-toggle"
            onClick={() => setAppTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
            {appTheme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
          <span aria-hidden="true" className="footer__separator">
            |
          </span>
          <RouteLink active={appRoute === '/'} label="home" onNavigate={navigate} path="/" />
          <RouteLink
            active={isMarketplaceListRoute || isMarketplaceDetailRoute}
            label="market"
            onNavigate={navigate}
            path="/marketplace"
          />
          <RouteLink
            active={appRoute === '/playground'}
            label="try"
            onNavigate={navigate}
            path="/playground"
          />
          <RouteLink
            active={pathname === '/onboarding/buyer'}
            label="buyer"
            onNavigate={navigate}
            path="/onboarding/buyer"
          />
          <RouteLink
            active={pathname === '/onboarding/seller'}
            label="seller"
            onNavigate={navigate}
            path="/onboarding/seller"
          />
          <RouteLink
            active={pathname === '/account'}
            label="account"
            onNavigate={navigate}
            path="/account"
          />
          <RouteLink
            active={pathname === '/demo'}
            label="demo"
            onNavigate={navigate}
            path="/demo"
          />
          <RouteLink
            active={pathname === '/raiders'}
            label="raiders"
            onNavigate={navigate}
            path="/raiders"
          />
          <RouteLink
            active={pathname === '/receipt'}
            label="receipt"
            onNavigate={navigate}
            path="/receipt"
          />
          <a
            className="footer__docs-link"
            href={BOSSRAID_DOCS_URL}
            target="_blank"
            rel="noreferrer"
          >
            docs
          </a>
          <a
            href="https://github.com/thomasjvu/mercenary"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <Icon className="icon icon--pixel" icon="pixel:github" />
          </a>
          <a href="https://x.com/ultima_gg" target="_blank" rel="noreferrer" aria-label="X">
            <Icon className="icon icon--pixel" icon="pixel:x" />
          </a>
        </div>
      </footer>
    </main>
  );
}

function RouteLink({
  active,
  label,
  onNavigate,
  path,
}: {
  active: boolean;
  label: string;
  onNavigate: (path: AppRoute) => void;
  path: AppRoute;
}) {
  return (
    <a
      className={`footer__route-link ${active ? 'footer__route-link--active' : ''}`}
      href={path}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }

        event.preventDefault();
        onNavigate(path);
      }}
    >
      {label}
    </a>
  );
}

function normalizePathname(pathname: string): AppRoute {
  if (pathname === '/marketplace' || pathname === '/marketplace/') {
    return '/marketplace';
  }
  if (pathname === '/playground' || pathname === '/playground/') {
    return '/playground';
  }
  if (pathname === '/onboarding/buyer' || pathname === '/onboarding/buyer/') {
    return '/onboarding/buyer';
  }
  if (pathname === '/onboarding/seller' || pathname === '/onboarding/seller/') {
    return '/onboarding/seller';
  }
  if (pathname === '/account' || pathname === '/account/') {
    return '/account';
  }
  if (pathname === '/demo' || pathname === '/demo/') {
    return '/demo';
  }
  if (pathname === '/raiders' || pathname === '/raiders/') {
    return '/raiders';
  }
  if (pathname === '/receipt' || pathname === '/receipt/') {
    return '/receipt';
  }
  return '/';
}

function getCurrentRoute(): AppRoute {
  return typeof window === 'undefined' ? '/' : normalizePathname(window.location.pathname);
}

function subscribeToLocation(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

function getInitialTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedTheme = window.localStorage.getItem(LANDING_THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

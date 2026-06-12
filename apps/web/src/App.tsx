import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { addCollection } from '@iconify/react';
import { icons as pixelIcons } from '@iconify-json/pixel';
import { icons as simpleIcons } from '@iconify-json/simple-icons';
import useSWR from 'swr';
import { bindAsciiRipple } from './ascii-ripple';
import { fetchJson, type Provider, type ProviderHealth } from './api';
import { AppSidebar } from './components/AppSidebar';
import type { AppRoute } from './lib/app-routes.js';
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
addCollection(simpleIcons);

export function App() {
  const appShellRef = useRef<HTMLElement | null>(null);
  const pathname = useSyncExternalStore(
    subscribeToLocation,
    () => (typeof window === 'undefined' ? '/' : window.location.pathname),
    () => '/'
  );
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
    <div
      className={`app-frame app-frame--theme-${appTheme} ${usesDirectoryLayout ? 'app-frame--directory' : ''}`}
    >
      <div className="bg-grid" aria-hidden="true" />

      <AppSidebar
        appTheme={appTheme}
        onNavigate={navigate}
        onThemeToggle={() => setAppTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        pathname={pathname}
      />

      <div className="app-main">
        <main
          className={`app-shell ${isLandingRoute ? 'app-shell--landing' : ''} ${usesDirectoryLayout ? 'app-shell--directory' : ''} ${isDemoRoute ? 'app-shell--demo-route' : ''} ${isRaidersRoute ? 'app-shell--raiders-route' : ''} ${isReceiptRoute ? 'app-shell--receipt-route' : ''}`}
          ref={appShellRef}
        >
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
        </main>
      </div>
    </div>
  );
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

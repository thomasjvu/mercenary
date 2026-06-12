import { startTransition, useEffect, useRef, useState } from 'react';
import { addCollection } from '@iconify/react';
import { icons as pixelIcons } from '@iconify-json/pixel';
import { icons as simpleIcons } from '@iconify-json/simple-icons';
import useSWR from 'swr';
import { bindAsciiRipple } from './ascii-ripple';
import { fetchJson, type Provider, type ProviderHealth } from './api';
import { AppSidebar } from './components/AppSidebar';
import { AttestationInspectorProvider } from './contexts/AttestationInspectorContext.js';
import type { AppRoute } from './lib/app-routes.js';
import { AccountPage } from './pages/AccountPage';
import { BuyerOnboardingPage } from './pages/BuyerOnboardingPage';
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
import { buildPlaygroundUrl, readPlaygroundMode } from './lib/playground-routing.js';
import { useLocationKey, useLocationPathname } from './lib/use-location.js';
import { ReceiptPage } from './pages/ReceiptPage';
import { RaidersPage } from './pages/RaidersPage';
import { SellerOnboardingPage } from './pages/SellerOnboardingPage';
import { HttpSellerWizardPage } from './pages/HttpSellerWizardPage';
import { ManageOffersPage } from './pages/ManageOffersPage';
type AppTheme = 'light' | 'dark';

const LANDING_THEME_STORAGE_KEY = 'bossraid.landing-theme';

addCollection(pixelIcons);
addCollection(simpleIcons);

export function App() {
  const appShellRef = useRef<HTMLElement | null>(null);
  const pathname = useLocationPathname();
  const locationKey = useLocationKey();
  const search =
    typeof window !== 'undefined' && locationKey.includes('?')
      ? locationKey.slice(locationKey.indexOf('?'))
      : '';
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getInitialTheme());
  const isLandingRoute = pathname === '/';
  const isMarketplaceListRoute = isMarketplaceListPath(pathname);
  const marketplaceModelId = readMarketplaceModelId(pathname);
  const isMarketplaceDetailRoute = isMarketplaceDetailPath(pathname);
  const isPlaygroundRoute = pathname === '/playground';
  const isLegacyDemoRoute = pathname === '/demo';
  const isBuyerOnboardingRoute = pathname === '/onboarding/buyer';
  const isSellerOnboardingRoute = pathname === '/onboarding/seller';
  const isHttpSellerOnboardingRoute = pathname === '/onboarding/seller/http';
  const isManageOffersRoute = pathname === '/sell/offers';
  const isAccountRoute = pathname === '/account';
  const isRaidersRoute = pathname === '/raiders';
  const isReceiptRoute = pathname === '/receipt';
  const playgroundMode =
    isPlaygroundRoute || isLegacyDemoRoute
      ? isLegacyDemoRoute
        ? 'raid'
        : readPlaygroundMode(search)
      : 'inference';
  const usesDirectoryLayout =
    (isPlaygroundRoute && playgroundMode === 'raid') || isRaidersRoute || isReceiptRoute;
  const playgroundModelId = isPlaygroundRoute ? readPlaygroundModelId(search) : undefined;

  const shouldLoadProviderData =
    isPlaygroundRoute ||
    isLegacyDemoRoute ||
    isRaidersRoute ||
    isMarketplaceListRoute ||
    isMarketplaceDetailRoute;
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
    if (typeof window === 'undefined' || pathname !== '/demo') {
      return;
    }

    const nextUrl = buildPlaygroundUrl({ mode: 'raid', search });
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({}, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [pathname, search]);

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

  function navigate(
    path: AppRoute,
    options?: { modelId?: string; marketplaceModelId?: string; mode?: 'inference' | 'raid' }
  ) {
    let nextUrl: string = path;
    if (path === '/marketplace' && options?.marketplaceModelId) {
      nextUrl = marketplaceModelPath(options.marketplaceModelId);
    } else if (path === '/playground') {
      nextUrl = buildPlaygroundUrl({
        mode: options?.mode,
        modelId: options?.modelId,
        search: window.location.pathname === '/playground' ? window.location.search : search,
      });
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
    <AttestationInspectorProvider>
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
            className={`app-shell ${isLandingRoute ? 'app-shell--landing' : ''} ${usesDirectoryLayout ? 'app-shell--directory' : ''} ${isPlaygroundRoute && playgroundMode === 'raid' ? 'app-shell--demo-route' : ''} ${isRaidersRoute ? 'app-shell--raiders-route' : ''} ${isReceiptRoute ? 'app-shell--receipt-route' : ''}`}
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
              <PlaygroundPage
                apiError={providers.error ?? providerHealth.error}
                initialModelId={playgroundModelId}
                mode={playgroundMode}
                onModeChange={(mode) => navigate('/playground', { mode })}
                providerHealth={providerHealth.data ?? []}
                providers={providers.data ?? []}
              />
            ) : isLegacyDemoRoute ? null : isBuyerOnboardingRoute ? (
              <BuyerOnboardingPage />
            ) : isSellerOnboardingRoute ? (
              <SellerOnboardingPage onNavigate={navigate} />
            ) : isHttpSellerOnboardingRoute ? (
              <HttpSellerWizardPage onNavigate={navigate} />
            ) : isManageOffersRoute ? (
              <ManageOffersPage />
            ) : isAccountRoute ? (
              <AccountPage />
            ) : isReceiptRoute ? (
              <ReceiptPage onNavigate={navigate} />
            ) : (
              <LandingPage onNavigate={navigate} />
            )}
          </main>
        </div>
      </div>
    </AttestationInspectorProvider>
  );
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

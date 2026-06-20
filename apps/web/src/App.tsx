import { lazy, startTransition, Suspense, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ensureIconCollections } from './lib/iconify-collections.js';
import { bindAsciiRipple } from './ascii-ripple';
import { fetchJson, type Provider, type ProviderHealth } from './api';
import { fetchMarkets } from './api/marketplace.js';
import { AppSidebar } from './components/AppSidebar';
import { ApiReadinessBanner } from './components/system/ApiReadinessBanner.js';
import { AttestationInspectorProvider } from './contexts/AttestationInspectorContext.js';
import type { AppRoute } from './lib/app-routes.js';
import {
  isMarketplaceDetailPath,
  isMarketplaceListPath,
  marketplaceModelPath,
  readMarketplaceModelId,
  readPlaygroundModelId,
} from './lib/routing.js';
import { buildPlaygroundUrl, readPlaygroundMode } from './lib/playground-routing.js';
import { useLocationKey, useLocationPathname } from './lib/use-location.js';
import {
  bountyDetailPath,
  isBountiesListPath,
  isBountyDetailPath,
  readBountyId,
} from './lib/bounty-routing.js';
import { readChangelogVersion } from './lib/changelog.js';
import type { LegalPageKind } from './pages/LegalPage';

const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((module) => ({ default: module.LandingPage }))
);
const MarketplacePage = lazy(() =>
  import('./pages/MarketplacePage').then((module) => ({ default: module.MarketplacePage }))
);
const ModelDetailPage = lazy(() =>
  import('./pages/ModelDetailPage').then((module) => ({ default: module.ModelDetailPage }))
);
const RaidersPage = lazy(() =>
  import('./pages/RaidersPage').then((module) => ({ default: module.RaidersPage }))
);
const BountiesPage = lazy(() =>
  import('./pages/BountiesPage').then((module) => ({ default: module.BountiesPage }))
);
const BountyDetailPage = lazy(() =>
  import('./pages/BountyDetailPage').then((module) => ({ default: module.BountyDetailPage }))
);
const LegalPage = lazy(() =>
  import('./pages/LegalPage').then((module) => ({ default: module.LegalPage }))
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({ default: module.AccountPage }))
);
const BuyerOnboardingPage = lazy(() =>
  import('./pages/BuyerOnboardingPage').then((module) => ({ default: module.BuyerOnboardingPage }))
);
const MercenaryPage = lazy(() =>
  import('./pages/MercenaryPage').then((module) => ({ default: module.MercenaryPage }))
);
const PlaygroundPage = lazy(() =>
  import('./pages/PlaygroundPage').then((module) => ({ default: module.PlaygroundPage }))
);
const ReceiptPage = lazy(() =>
  import('./pages/ReceiptPage').then((module) => ({ default: module.ReceiptPage }))
);
const PartyQuestPage = lazy(() =>
  import('./pages/PartyQuestPage').then((module) => ({ default: module.PartyQuestPage }))
);
const SellerOnboardingPage = lazy(() =>
  import('./pages/SellerOnboardingPage').then((module) => ({
    default: module.SellerOnboardingPage,
  }))
);
const HttpSellerWizardPage = lazy(() =>
  import('./pages/HttpSellerWizardPage').then((module) => ({
    default: module.HttpSellerWizardPage,
  }))
);
const ManageOffersPage = lazy(() =>
  import('./pages/ManageOffersPage').then((module) => ({ default: module.ManageOffersPage }))
);
const ChangelogPage = lazy(() =>
  import('./pages/ChangelogPage').then((module) => ({ default: module.ChangelogPage }))
);
const ChangelogReleasePage = lazy(() =>
  import('./pages/ChangelogReleasePage').then((module) => ({
    default: module.ChangelogReleasePage,
  }))
);
type AppTheme = 'light' | 'dark';

const LANDING_THEME_STORAGE_KEY = 'bossraid.landing-theme';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'bossraid.sidebar-collapsed';

export function App() {
  useEffect(() => {
    void ensureIconCollections();
  }, []);

  const appShellRef = useRef<HTMLElement | null>(null);
  const pathname = useLocationPathname();
  const locationKey = useLocationKey();
  const search =
    typeof window !== 'undefined' && locationKey.includes('?')
      ? locationKey.slice(locationKey.indexOf('?'))
      : '';
  const [appTheme, setAppTheme] = useState<AppTheme>(() => getInitialTheme());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => getInitialSidebarCollapsed());
  const isLandingRoute = pathname === '/';
  const isMercenaryRoute = pathname === '/mercenary';
  const isMarketplaceListRoute = isMarketplaceListPath(pathname);
  const marketplaceModelId = readMarketplaceModelId(pathname);
  const isMarketplaceDetailRoute = isMarketplaceDetailPath(pathname);
  const isPlaygroundRoute = pathname === '/playground';
  const isBuyerOnboardingRoute = pathname === '/onboarding/buyer';
  const isSellerOnboardingRoute = pathname === '/onboarding/seller';
  const isHttpSellerOnboardingRoute = pathname === '/onboarding/seller/http';
  const isManageOffersRoute = pathname === '/sell/offers';
  const isAccountRoute = pathname === '/account';
  const isRaidersRoute = pathname === '/raiders';
  const isBountiesListRoute = isBountiesListPath(pathname);
  const bountyId = readBountyId(pathname);
  const isBountyDetailRoute = isBountyDetailPath(pathname);
  const isPartyQuestRoute = pathname === '/party-quest';
  const isLegacyReceiptRoute = pathname === '/receipt';
  const isVerificationRoute = pathname === '/verification';
  const changelogVersion = readChangelogVersion(pathname);
  const isChangelogIndexRoute = pathname === '/changelog';
  const isChangelogReleaseRoute = changelogVersion !== null;
  const legalPageKind = readLegalPageKind(pathname);
  const playgroundMode = isPlaygroundRoute ? readPlaygroundMode(search) : 'inference';
  const usesDirectoryLayout =
    isMercenaryRoute ||
    (isPlaygroundRoute && playgroundMode === 'raid') ||
    isVerificationRoute ||
    isLegacyReceiptRoute;
  const playgroundModelId = isPlaygroundRoute ? readPlaygroundModelId(search) : undefined;

  const shouldLoadProviderData =
    isMercenaryRoute ||
    isPlaygroundRoute ||
    isRaidersRoute ||
    isPartyQuestRoute ||
    isMarketplaceListRoute ||
    isMarketplaceDetailRoute;
  const providers = useSWR<Provider[]>(
    shouldLoadProviderData ? '/v1/providers?onlineOnly=false' : null,
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
  const markets = useSWR(
    isMarketplaceListRoute || isMarketplaceDetailRoute ? 'markets-api-banner' : null,
    () => fetchMarkets(),
    { refreshInterval: 15_000 }
  );
  const apiError = providers.error ?? providerHealth.error ?? markets.error;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (pathname === '/receipt') {
      const nextUrl = `/verification${search}`;
      if (window.location.pathname + window.location.search !== nextUrl) {
        window.history.replaceState({}, '', nextUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
  }, [sidebarCollapsed]);

  function navigate(
    path: AppRoute,
    options?: {
      modelId?: string;
      marketplaceModelId?: string;
      bountyId?: string;
      mode?: 'inference' | 'raid';
    }
  ) {
    let nextUrl: string = path;
    if (path === '/bounties' && options?.bountyId) {
      nextUrl = bountyDetailPath(options.bountyId);
    } else if (path === '/marketplace' && options?.marketplaceModelId) {
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
        className={`app-frame app-frame--theme-${appTheme}${sidebarCollapsed ? ' app-frame--sidebar-collapsed' : ''}${usesDirectoryLayout ? ' app-frame--directory' : ''}`}
      >
        <div className="bg-grid" aria-hidden="true" />

        <ApiReadinessBanner error={apiError} />

        <AppSidebar
          appTheme={appTheme}
          collapsed={sidebarCollapsed}
          onNavigate={navigate}
          onSidebarToggle={() => setSidebarCollapsed((current) => !current)}
          onThemeToggle={() => setAppTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          pathname={pathname}
        />

        <div className="app-main">
          <main
            className={`app-shell ${isLandingRoute ? 'app-shell--landing' : ''} ${usesDirectoryLayout ? 'app-shell--directory' : ''} ${isMercenaryRoute || (isPlaygroundRoute && playgroundMode === 'raid') ? 'app-shell--mercenary-route' : ''} ${isVerificationRoute || isLegacyReceiptRoute ? 'app-shell--receipt-route' : ''}`}
            ref={appShellRef}
          >
            <Suspense fallback={<div className="app-route-loading">Loading…</div>}>
              {isBountiesListRoute ? (
                <BountiesPage onNavigate={navigate} />
              ) : isBountyDetailRoute && bountyId ? (
                <BountyDetailPage bountyId={bountyId} onBack={() => navigate('/bounties')} />
              ) : isPartyQuestRoute ? (
                <PartyQuestPage onNavigate={navigate} />
              ) : isRaidersRoute ? (
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
                  onOpenModel={(modelId) =>
                    navigate('/marketplace', { marketplaceModelId: modelId })
                  }
                />
              ) : isMercenaryRoute ? (
                <MercenaryPage
                  providerHealth={providerHealth.data ?? []}
                  providers={providers.data ?? []}
                />
              ) : isPlaygroundRoute ? (
                <PlaygroundPage
                  initialModelId={playgroundModelId}
                  mode={playgroundMode}
                  onModeChange={(mode) => navigate('/playground', { mode })}
                  providerHealth={providerHealth.data ?? []}
                  providers={providers.data ?? []}
                />
              ) : isBuyerOnboardingRoute ? (
                <BuyerOnboardingPage />
              ) : isSellerOnboardingRoute ? (
                <SellerOnboardingPage onNavigate={navigate} />
              ) : isHttpSellerOnboardingRoute ? (
                <HttpSellerWizardPage onNavigate={navigate} />
              ) : isManageOffersRoute ? (
                <ManageOffersPage />
              ) : isAccountRoute ? (
                <AccountPage onNavigate={navigate} />
              ) : isVerificationRoute || isLegacyReceiptRoute ? (
                <ReceiptPage />
              ) : isChangelogReleaseRoute && changelogVersion ? (
                <ChangelogReleasePage version={changelogVersion} />
              ) : isChangelogIndexRoute ? (
                <ChangelogPage />
              ) : legalPageKind ? (
                <LegalPage kind={legalPageKind} onNavigate={navigate} />
              ) : (
                <LandingPage onNavigate={navigate} />
              )}
            </Suspense>
          </main>
        </div>
      </div>
    </AttestationInspectorProvider>
  );
}

function readLegalPageKind(pathname: string): LegalPageKind | null {
  if (pathname === '/legal' || pathname === '/terms-of-service') {
    return 'terms';
  }
  if (pathname === '/privacy-policy') {
    return 'privacy';
  }
  if (pathname === '/acceptable-use-policy') {
    return 'aup';
  }
  return null;
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
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

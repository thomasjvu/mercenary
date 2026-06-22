import { BOSSRAID_DOCS_URL } from '@bossraid/ui';

export type AppRoute =
  | '/'
  | '/mercenary'
  | '/bounties'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/onboarding/seller/http'
  | '/sell/offers'
  | '/account'
  | '/raiders'
  | '/verification'
  | '/legal'
  | '/changelog'
  | '/terms-of-service'
  | '/privacy-policy'
  | '/acceptable-use-policy';

export type SidebarInternalNavItem = {
  path: AppRoute;
  label: string;
  icon: string;
  children?: SidebarInternalNavItem[];
};

export type SidebarExternalNavItem = {
  href: string;
  label: string;
  icon: string;
};

export type SidebarNavItem = SidebarInternalNavItem | SidebarExternalNavItem;

export function isExternalSidebarNavItem(item: SidebarNavItem): item is SidebarExternalNavItem {
  return 'href' in item;
}

export const SIDEBAR_NAV_LINKS: SidebarNavItem[] = [
  { path: '/', label: 'home', icon: 'pixel:home-solid' },
  { path: '/mercenary', label: 'Mercenary', icon: 'pixel:message-dots-solid' },
  { path: '/bounties', label: 'bounties', icon: 'pixel:trophy-solid' },
  {
    path: '/marketplace',
    label: 'marketplace',
    icon: 'pixel:shop-solid',
    children: [
      { path: '/onboarding/buyer', label: 'buy', icon: 'pixel:shopping-cart-solid' },
      { path: '/onboarding/seller', label: 'new offer', icon: 'pixel:plus-solid' },
      { path: '/sell/offers', label: 'my offers', icon: 'pixel:clipboard-solid' },
    ],
  },
  { path: '/playground', label: 'playground', icon: 'pixel:sparkles-solid' },
  { path: '/raiders', label: 'raiders', icon: 'pixel:crown-solid' },
  { path: '/verification', label: 'verification', icon: 'pixel:receipt-solid' },
  {
    path: '/legal',
    label: 'legal',
    icon: 'pixel:bookmark-solid',
    children: [
      { path: '/terms-of-service', label: 'terms', icon: 'pixel:clipboard-solid' },
      { path: '/privacy-policy', label: 'privacy', icon: 'pixel:lock-solid' },
      {
        path: '/acceptable-use-policy',
        label: 'acceptable use',
        icon: 'pixel:check-circle-solid',
      },
    ],
  },
  { href: BOSSRAID_DOCS_URL, label: 'docs', icon: 'pixel:bookmark-solid' },
];

const MARKETPLACE_CHILD_PATHS = new Set<AppRoute>([
  '/marketplace',
  '/onboarding/buyer',
  '/onboarding/seller',
  '/onboarding/seller/http',
  '/sell/offers',
]);

const LEGAL_CHILD_PATHS = new Set<AppRoute>([
  '/legal',
  '/terms-of-service',
  '/privacy-policy',
  '/acceptable-use-policy',
]);

export function isMarketplaceSectionActive(pathname: string): boolean {
  return MARKETPLACE_CHILD_PATHS.has(pathname as AppRoute) || pathname.startsWith('/marketplace/');
}

export function isLegalSectionActive(pathname: string): boolean {
  return LEGAL_CHILD_PATHS.has(pathname as AppRoute);
}

export function isNavGroupSectionActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return isMarketplaceSectionActive(pathname);
  }

  if (path === '/legal') {
    return isLegalSectionActive(pathname);
  }

  return false;
}

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return isMarketplaceSectionActive(pathname);
  }

  if (path === '/legal') {
    return isLegalSectionActive(pathname);
  }

  if (path === '/onboarding/seller') {
    return pathname === '/onboarding/seller' || pathname === '/onboarding/seller/http';
  }

  return pathname === path;
}

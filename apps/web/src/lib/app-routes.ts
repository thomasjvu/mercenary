import { BOSSRAID_DOCS_URL } from '@bossraid/ui';

export type AppRoute =
  | '/'
  | '/mercenary'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/onboarding/seller/http'
  | '/sell/offers'
  | '/account'
  | '/raiders'
  | '/verification'
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
  { href: BOSSRAID_DOCS_URL, label: 'docs', icon: 'pixel:notebook-solid' },
];

const MARKETPLACE_CHILD_PATHS = new Set<AppRoute>([
  '/marketplace',
  '/onboarding/buyer',
  '/onboarding/seller',
  '/onboarding/seller/http',
  '/sell/offers',
]);

export function isMarketplaceSectionActive(pathname: string): boolean {
  return MARKETPLACE_CHILD_PATHS.has(pathname as AppRoute) || pathname.startsWith('/marketplace/');
}

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return isMarketplaceSectionActive(pathname);
  }

  if (path === '/onboarding/seller') {
    return pathname === '/onboarding/seller' || pathname === '/onboarding/seller/http';
  }

  return pathname === path;
}

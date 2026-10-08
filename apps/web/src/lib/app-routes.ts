import { BOSSRAID_DOCS_URL } from '@bossraid/ui';

export type AppRoute =
  | '/'
  | '/mercenary'
  | '/bounties'
  | '/playground'
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
  { path: '/playground', label: 'raid playground', icon: 'pixel:sparkles-solid' },
  {
    path: '/raiders',
    label: 'raiders',
    icon: 'pixel:crown-solid',
    children: [
      { path: '/onboarding/seller/http', label: 'register worker', icon: 'pixel:plus-solid' },
      { path: '/sell/offers', label: 'manage offers', icon: 'pixel:clipboard-solid' },
    ],
  },
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
  { href: 'https://alkahest.ai', label: 'Alkahest inference', icon: 'pixel:shop-solid' },
  { href: BOSSRAID_DOCS_URL, label: 'docs', icon: 'pixel:bookmark-solid' },
];

const LEGAL_CHILD_PATHS = new Set<AppRoute>([
  '/legal',
  '/terms-of-service',
  '/privacy-policy',
  '/acceptable-use-policy',
]);

export function isLegalSectionActive(pathname: string): boolean {
  return LEGAL_CHILD_PATHS.has(pathname as AppRoute);
}

export function isNavGroupSectionActive(path: AppRoute, pathname: string): boolean {
  if (path === '/raiders') {
    return (
      pathname === '/raiders' ||
      pathname === '/onboarding/seller/http' ||
      pathname === '/sell/offers'
    );
  }

  if (path === '/legal') {
    return isLegalSectionActive(pathname);
  }

  return false;
}

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (isNavGroupSectionActive(path, pathname)) {
    return true;
  }

  return pathname === path;
}

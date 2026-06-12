export type AppRoute =
  | '/'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/sell/offers'
  | '/account'
  | '/raiders'
  | '/receipt';

export type SidebarNavItem = {
  path: AppRoute;
  label: string;
};

export const SIDEBAR_EXPLORE_LINKS: SidebarNavItem[] = [
  { path: '/', label: 'home' },
  { path: '/marketplace', label: 'market' },
  { path: '/playground', label: 'playground' },
  { path: '/raiders', label: 'raiders' },
  { path: '/receipt', label: 'receipt' },
];

export const SIDEBAR_ACCOUNT_LINKS: SidebarNavItem[] = [
  { path: '/account', label: 'account' },
  { path: '/onboarding/buyer', label: 'buy' },
  { path: '/onboarding/seller', label: 'new offer' },
  { path: '/sell/offers', label: 'my offers' },
];

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return pathname === '/marketplace' || pathname.startsWith('/marketplace/');
  }

  return pathname === path;
}

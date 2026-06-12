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

export type SidebarNavItem = {
  path: AppRoute;
  label: string;
};

export const SIDEBAR_EXPLORE_LINKS: SidebarNavItem[] = [
  { path: '/', label: 'home' },
  { path: '/marketplace', label: 'market' },
  { path: '/playground', label: 'try' },
  { path: '/demo', label: 'raid' },
  { path: '/raiders', label: 'raiders' },
  { path: '/receipt', label: 'receipt' },
];

export const SIDEBAR_ACCOUNT_LINKS: SidebarNavItem[] = [
  { path: '/account', label: 'account' },
  { path: '/onboarding/buyer', label: 'buy' },
  { path: '/onboarding/seller', label: 'sell' },
];

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return pathname === '/marketplace' || pathname.startsWith('/marketplace/');
  }

  return pathname === path;
}

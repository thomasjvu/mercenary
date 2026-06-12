export type AppRoute =
  | '/'
  | '/marketplace'
  | '/playground'
  | '/onboarding/buyer'
  | '/onboarding/seller'
  | '/onboarding/seller/http'
  | '/sell/offers'
  | '/account'
  | '/raiders'
  | '/receipt';

export type SidebarNavItem = {
  path: AppRoute;
  label: string;
  icon: string;
};

export const SIDEBAR_EXPLORE_LINKS: SidebarNavItem[] = [
  { path: '/', label: 'home', icon: 'pixel:home-solid' },
  { path: '/marketplace', label: 'market', icon: 'pixel:shop-solid' },
  { path: '/playground', label: 'playground', icon: 'pixel:sparkles-solid' },
  { path: '/raiders', label: 'raiders', icon: 'pixel:sword-solid' },
  { path: '/receipt', label: 'receipt', icon: 'pixel:coin-solid' },
];

export const SIDEBAR_ACCOUNT_LINKS: SidebarNavItem[] = [
  { path: '/account', label: 'account', icon: 'pixel:user-solid' },
  { path: '/onboarding/buyer', label: 'buy', icon: 'pixel:cart-solid' },
  { path: '/onboarding/seller', label: 'new offer', icon: 'pixel:plus-solid' },
  { path: '/sell/offers', label: 'my offers', icon: 'pixel:list-solid' },
];

export function isSidebarNavActive(path: AppRoute, pathname: string): boolean {
  if (path === '/marketplace') {
    return pathname === '/marketplace' || pathname.startsWith('/marketplace/');
  }

  if (path === '/onboarding/seller') {
    return pathname === '/onboarding/seller' || pathname === '/onboarding/seller/http';
  }

  return pathname === path;
}

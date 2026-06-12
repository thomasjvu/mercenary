import { useSyncExternalStore } from 'react';

export function subscribeToLocation(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

export function readLocationPathname(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname;
}

export function readLocationKey(): string {
  if (typeof window === 'undefined') {
    return '/';
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function useLocationPathname(): string {
  return useSyncExternalStore(subscribeToLocation, readLocationPathname, () => '/');
}

export function useLocationKey(): string {
  return useSyncExternalStore(subscribeToLocation, readLocationKey, () => '/');
}

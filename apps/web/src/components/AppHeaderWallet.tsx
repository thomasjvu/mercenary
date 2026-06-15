import { Icon } from '@iconify/react';
import type { AppRoute } from '../lib/app-routes.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';

type AppHeaderWalletProps = {
  onNavigate: (path: AppRoute) => void;
  compact?: boolean;
};

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) {
    return wallet;
  }

  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function AppHeaderWallet({ onNavigate, compact = false }: AppHeaderWalletProps) {
  const { session, connectWallet, signOut, sessionLoading, isAuthenticated } = useWalletAuth('');

  if (sessionLoading) {
    if (compact) {
      return (
        <span
          aria-busy="true"
          className="app-header-wallet__compact app-header-wallet__compact--loading"
        >
          …
        </span>
      );
    }

    return (
      <div
        aria-busy="true"
        className="app-header-wallet__session-bar app-header-wallet__session-bar--loading"
      >
        …
      </div>
    );
  }

  if (!isAuthenticated || !session?.wallet) {
    if (compact) {
      return (
        <button
          aria-label="Connect wallet"
          className="app-header-wallet__compact app-header-wallet__compact--connect"
          onClick={() => void connectWallet()}
          type="button"
        >
          @
        </button>
      );
    }

    return (
      <button
        className="button button--primary app-header-wallet__session-bar app-header-wallet__session-bar--connect"
        onClick={() => void connectWallet()}
        type="button"
      >
        connect wallet
      </button>
    );
  }

  if (compact) {
    return (
      <button
        aria-label={`Account ${session.wallet}`}
        className="app-header-wallet__compact app-header-wallet__compact--signed-in"
        onClick={() => onNavigate('/account')}
        title={session.wallet}
        type="button"
      >
        @
      </button>
    );
  }

  return (
    <div className="app-header-wallet__session-bar">
      <button
        className="app-header-wallet__address"
        onClick={() => onNavigate('/account')}
        title={session.wallet}
        type="button"
      >
        {truncateWallet(session.wallet)}
      </button>
      <button
        aria-label="Sign out"
        className="app-header-wallet__sign-out-icon"
        onClick={() => void signOut()}
        type="button"
      >
        <Icon className="icon icon--pixel" icon="pixel:logout-solid" />
      </button>
    </div>
  );
}

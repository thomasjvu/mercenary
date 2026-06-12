import type { AppRoute } from '../lib/app-routes.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';

type AppHeaderWalletProps = {
  onNavigate: (path: AppRoute) => void;
};

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) {
    return wallet;
  }

  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function AppHeaderWallet({ onNavigate }: AppHeaderWalletProps) {
  const { session, connectWallet, signOut, sessionLoading, isAuthenticated } = useWalletAuth('');

  if (sessionLoading) {
    return <span className="app-header-wallet app-header-wallet--loading">…</span>;
  }

  if (!isAuthenticated || !session?.wallet) {
    return (
      <button
        className="button button--primary app-header-wallet__connect"
        onClick={() => void connectWallet()}
        type="button"
      >
        connect wallet
      </button>
    );
  }

  return (
    <div className="app-header-wallet">
      <button
        className="app-header-wallet__address"
        onClick={() => onNavigate('/account')}
        title={session.wallet}
        type="button"
      >
        {truncateWallet(session.wallet)}
      </button>
      <button className="app-header-wallet__sign-out" onClick={() => void signOut()} type="button">
        sign out
      </button>
    </div>
  );
}

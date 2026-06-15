import { useWalletAuth } from '../../hooks/useWalletAuth.js';

type WalletGateProps = {
  message?: string;
  className?: string;
};

export function WalletGate({
  message = 'Connect wallet to continue.',
  className = '',
}: WalletGateProps) {
  const { connectWallet, isAuthenticated, status } = useWalletAuth(message);

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className={`wallet-gate${className ? ` ${className}` : ''}`}>
      <p className="wallet-gate__message">{status}</p>
      <button className="button button--primary" onClick={() => void connectWallet()} type="button">
        connect wallet
      </button>
    </div>
  );
}

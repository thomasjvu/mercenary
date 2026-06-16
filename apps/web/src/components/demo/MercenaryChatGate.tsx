import type { ReactNode } from 'react';

type MercenaryChatGateProps = {
  children: ReactNode;
  connectWallet: () => Promise<unknown>;
  isAuthenticated: boolean;
  sessionLoading: boolean;
  status: string;
};

const SIGN_IN_IDLE_STATUS = 'Sign in to speak with Mercenary.';

export function MercenaryChatGate({
  children,
  connectWallet,
  isAuthenticated,
  sessionLoading,
  status,
}: MercenaryChatGateProps) {
  if (sessionLoading) {
    return <div className="mercenary-chat-shell mercenary-chat-shell--loading">{children}</div>;
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const showStatus = status.trim().length > 0 && status !== SIGN_IN_IDLE_STATUS;

  return (
    <div className="mercenary-chat-shell mercenary-chat-shell--locked">
      <div aria-hidden="true" className="mercenary-chat-shell__backdrop">
        {children}
      </div>
      <div className="mercenary-chat-shell__overlay">
        <button
          className="button button--primary info-panel__cta mercenary-chat-shell__cta"
          onClick={() => void connectWallet()}
          type="button"
        >
          sign in required
        </button>
        {showStatus ? <p className="mercenary-chat-shell__status">{status}</p> : null}
      </div>
    </div>
  );
}

export { SIGN_IN_IDLE_STATUS };

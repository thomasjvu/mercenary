import useSWR from 'swr';
import type { Provider, ProviderHealth } from '../api';
import { fetchReady } from '../api/health.js';
import { DemoRaidForm } from '../components/demo/DemoRaidForm';
import { DemoRaidProgress } from '../components/demo/DemoRaidProgress';
import { DemoRaidResult } from '../components/demo/DemoRaidResult';
import { DemoRaidSidebar } from '../components/demo/DemoRaidSidebar';
import { MercenaryChatHeader } from '../components/demo/MercenaryChatHeader.js';
import { MercenaryChatGate, SIGN_IN_IDLE_STATUS } from '../components/demo/MercenaryChatGate.js';
import { useSmartAccountPay } from '../hooks/useSmartAccountPay.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { useRaidDemo } from '../hooks/useRaidDemo';

type DemoPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  embedded?: boolean;
};

export function DemoPage({ providers, providerHealth, embedded = false }: DemoPageProps) {
  const ready = useSWR('mercenary-ready', fetchReady, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });
  const walletAuth = useWalletAuth(SIGN_IN_IDLE_STATUS);
  const smartPay = useSmartAccountPay();
  const paymentEnabled = ready.data?.payment.enabled === true;
  const isSignedIn = walletAuth.isAuthenticated;

  const demo = useRaidDemo({
    providers,
    providerHealth,
    paymentEnabled,
    createFetchWithPayment: smartPay.createFetchWithPayment,
    persistThreads: !embedded,
  });

  return (
    <section
      className={`mercenary-demo${embedded ? ' mercenary-demo--embedded' : ''}`}
      id={embedded ? undefined : 'demo'}
    >
      <article className="mercenary-chat">
        <MercenaryChatHeader
          balanceUsd={walletAuth.session?.account?.balanceUsd}
          demoMode={demo.demoMode}
          hasConversation={demo.hasConversation}
          isAuthenticated={isSignedIn}
          isLaunching={demo.isLaunching}
          onDemoModeChange={demo.handleModeChange}
          onResetConversation={demo.resetConversation}
        />

        <MercenaryChatGate
          connectWallet={walletAuth.connectWallet}
          isAuthenticated={walletAuth.isAuthenticated}
          sessionLoading={walletAuth.sessionLoading}
          status={walletAuth.status}
        >
          <div aria-live="polite" className="mercenary-chat__thread" ref={demo.threadRef}>
            <DemoRaidProgress
              activeRaidStatus={demo.activeRaidStatus}
              demoMode={demo.demoMode}
              elapsedLabel={demo.elapsedLabel}
              isLaunching={demo.isLaunching}
              lastSubmittedBrief={demo.lastSubmittedBrief}
              launchError={demo.launchError}
              liveRaidRun={demo.liveRaidRun}
              raidIsTerminal={demo.raidIsTerminal}
            />

            {demo.liveRaidRun ? (
              <DemoRaidResult
                demoMode={demo.demoMode}
                directResponse={demo.liveRaidRun.directResponse}
                expandedArtifact={demo.expandedArtifact}
                hasLiveRun={Boolean(demo.liveRaidRun)}
                lastSubmittedBrief={demo.lastSubmittedBrief}
                liveArtifacts={demo.liveArtifacts}
                liveExplanation={demo.liveExplanation}
                livePatch={demo.livePatch}
                liveResultText={demo.liveResultText}
                onCloseArtifact={() => demo.setExpandedArtifact(null)}
                onCopyReceiptLink={() => void demo.copyReceiptLink()}
                onOpenArtifact={demo.setExpandedArtifact}
                raidIsTerminal={demo.raidIsTerminal}
                receiptCopied={demo.receiptCopied}
                receiptPath={demo.liveRaidRun.spawn.receiptPath ?? null}
                requestMode={demo.liveRaidRun.requestMode}
              />
            ) : null}
          </div>

          {!isSignedIn && ready.data && !paymentEnabled ? (
            <p className="quiet-note mercenary-payment-note">
              Payment is not configured on this host. Enable x402 before launching raids or
              inference.
            </p>
          ) : null}

          <DemoRaidForm
            canSendBrief={demo.canSendBrief && isSignedIn}
            hasConversation={demo.hasConversation}
            isLaunching={demo.isLaunching}
            liveDemoBrief={demo.liveDemoBrief}
            onBriefChange={demo.setLiveDemoBrief}
            onLaunch={() => void demo.launchConversation()}
            promptSuggestions={demo.promptSuggestions}
          />
        </MercenaryChatGate>
      </article>

      <DemoRaidSidebar
        activeRaidStatus={demo.activeRaidStatus}
        activeThreadId={demo.activeThreadId}
        canLaunchLiveRaid={demo.canLaunchLiveRaid}
        highlightedSidebarSpecialists={demo.highlightedSidebarSpecialists}
        liveRaidRun={demo.liveRaidRun}
        mercenaryDecisionTrace={demo.mercenaryDecisionTrace}
        onCopyReceiptLink={() => void demo.copyReceiptLink()}
        onDeleteThread={demo.deleteThread}
        onNewThread={demo.startNewThread}
        onRenameThread={demo.renameThread}
        onSelectThread={demo.selectThread}
        raidIsTerminal={demo.raidIsTerminal}
        receiptCopied={demo.receiptCopied}
        runtimeAttestationStatus={demo.runtimeAttestationStatus}
        runtimeAttestationTone={demo.runtimeAttestationTone}
        showReceiptLinks={demo.showReceiptLinks}
        showThreadList={!embedded}
        showTraceLink={demo.showTraceLink}
        showTracePanel={demo.showTracePanel}
        specialistTraces={demo.specialistTraces}
        threads={demo.threads}
        traceEventCount={demo.traceEventCount}
      />
    </section>
  );
}

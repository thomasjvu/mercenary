import useSWR from 'swr';
import type { Provider, ProviderHealth } from '../../api';
import { fetchReady } from '../../api/health.js';
import { useSmartAccountPay } from '../../hooks/useSmartAccountPay.js';
import { useWalletAuth } from '../../hooks/useWalletAuth.js';
import { useMercenaryPayment } from '../../hooks/useMercenaryPayment.js';
import { useMercenaryRaid } from '../../hooks/useMercenaryRaid';
import { MercenaryChatGate, SIGN_IN_IDLE_STATUS } from './MercenaryChatGate.js';
import { MercenaryChatHeader } from './MercenaryChatHeader.js';
import { MercenaryRaidForm } from './MercenaryRaidForm';
import { MercenaryRaidProgress } from './MercenaryRaidProgress';
import { MercenaryRaidResult } from './MercenaryRaidResult';
import { MercenaryRaidSidebar } from './MercenaryRaidSidebar';

type MercenaryWorkspaceProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  embedded?: boolean;
};

export function MercenaryWorkspace({
  providers,
  providerHealth,
  embedded = false,
}: MercenaryWorkspaceProps) {
  const ready = useSWR('mercenary-ready', fetchReady, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });
  const walletAuth = useWalletAuth(SIGN_IN_IDLE_STATUS);
  const smartPay = useSmartAccountPay();
  const payment = useMercenaryPayment();
  const paymentEnabled = ready.data?.payment.enabled === true;
  const isSignedIn = walletAuth.isAuthenticated;

  const mercenary = useMercenaryRaid({
    providers,
    providerHealth,
    paymentEnabled,
    createFetchWithPayment: smartPay.createFetchWithPayment,
    paymentMode: payment.paymentMode,
    apiKeySecret: payment.apiKeySecret,
    persistThreads: !embedded,
  });

  return (
    <section className={`mercenary-workspace${embedded ? ' mercenary-workspace--embedded' : ''}`}>
      <article className="mercenary-chat">
        <MercenaryChatHeader
          hasConversation={mercenary.hasConversation}
          isLaunching={mercenary.isLaunching}
          onResetConversation={mercenary.resetConversation}
        />

        <MercenaryChatGate
          connectWallet={walletAuth.connectWallet}
          isAuthenticated={walletAuth.isAuthenticated}
          sessionLoading={walletAuth.sessionLoading}
          status={walletAuth.status}
        >
          <div aria-live="polite" className="mercenary-chat__thread" ref={mercenary.threadRef}>
            <MercenaryRaidProgress
              activeRaidStatus={mercenary.activeRaidStatus}
              elapsedLabel={mercenary.elapsedLabel}
              isLaunching={mercenary.isLaunching}
              lastSubmittedBrief={mercenary.lastSubmittedBrief}
              launchError={mercenary.launchError}
              liveRaidRun={mercenary.liveRaidRun}
              raidIsTerminal={mercenary.raidIsTerminal}
            />

            {mercenary.liveRaidRun ? (
              <MercenaryRaidResult
                completedAt={mercenary.liveRaidRun.lastUpdatedAt}
                directResponse={mercenary.liveRaidRun.directResponse}
                expandedArtifact={mercenary.expandedArtifact}
                hasLiveRun={Boolean(mercenary.liveRaidRun)}
                lastSubmittedBrief={mercenary.lastSubmittedBrief}
                liveArtifacts={mercenary.liveArtifacts}
                liveExplanation={mercenary.liveExplanation}
                livePatch={mercenary.livePatch}
                liveResultText={mercenary.liveResultText}
                onCloseArtifact={() => mercenary.setExpandedArtifact(null)}
                onCopyReceiptLink={() => void mercenary.copyReceiptLink()}
                onOpenArtifact={mercenary.setExpandedArtifact}
                raidIsTerminal={mercenary.raidIsTerminal}
                receiptCopied={mercenary.receiptCopied}
                receiptPath={mercenary.liveRaidRun.spawn.receiptPath ?? null}
              />
            ) : null}
          </div>

          {!isSignedIn && ready.data && !paymentEnabled ? (
            <p className="quiet-note mercenary-payment-note">
              Payment is not configured on this host. Enable x402 before launching raids or
              inference.
            </p>
          ) : null}

          <MercenaryRaidForm
            balanceUsd={walletAuth.session?.account?.balanceUsd}
            canSendBrief={mercenary.canSendBrief && isSignedIn}
            hasConversation={mercenary.hasConversation}
            isAuthenticated={isSignedIn}
            isLaunching={mercenary.isLaunching}
            maxBudgetUsd={mercenary.maxBudgetUsd}
            onBriefChange={mercenary.setRaidBrief}
            onBudgetChange={mercenary.setMaxBudgetUsd}
            onLaunch={() => void mercenary.launchConversation()}
            promptSuggestions={mercenary.promptSuggestions}
            raidBrief={mercenary.raidBrief}
          />
        </MercenaryChatGate>
      </article>

      <MercenaryRaidSidebar
        activeRaidStatus={mercenary.activeRaidStatus}
        activeThreadId={mercenary.activeThreadId}
        budgetPending={payment.budgetPending}
        budgetStatus={payment.budgetStatus}
        canLaunchLiveRaid={mercenary.canLaunchLiveRaid}
        isLaunching={mercenary.isLaunching}
        keyCreate={payment.keyCreate}
        keyOptions={payment.keyOptions}
        maxBudgetUsd={mercenary.maxBudgetUsd}
        onMaxBudgetUsdChange={mercenary.setMaxBudgetUsd}
        onSaveSpendLimit={() => void payment.saveSpendLimit()}
        onSelectApiKey={payment.selectApiKey}
        onSpendLimitDraftChange={payment.setSpendLimitDraft}
        paymentMode={payment.paymentMode}
        selectedApiKeyId={payment.selectedApiKeyId}
        selectedKey={payment.selectedKey}
        spendLimitDraft={payment.spendLimitDraft}
        highlightedSidebarSpecialists={mercenary.highlightedSidebarSpecialists}
        liveRaidRun={mercenary.liveRaidRun}
        mercenaryDecisionTrace={mercenary.mercenaryDecisionTrace}
        onCopyReceiptLink={() => void mercenary.copyReceiptLink()}
        onDeleteThread={mercenary.deleteThread}
        onNewThread={mercenary.startNewThread}
        onRenameThread={mercenary.renameThread}
        onSelectThread={mercenary.selectThread}
        raidIsTerminal={mercenary.raidIsTerminal}
        receiptCopied={mercenary.receiptCopied}
        runtimeAttestationStatus={mercenary.runtimeAttestationStatus}
        runtimeAttestationTone={mercenary.runtimeAttestationTone}
        showReceiptLinks={mercenary.showReceiptLinks}
        showThreadList={!embedded}
        showTraceLink={mercenary.showTraceLink}
        showTracePanel={mercenary.showTracePanel}
        specialistTraces={mercenary.specialistTraces}
        threads={mercenary.threads}
        traceEventCount={mercenary.traceEventCount}
      />
    </section>
  );
}

import { useState } from 'react';
import type { Provider, ProviderHealth } from '../api';
import { DemoRaidForm } from '../components/demo/DemoRaidForm';
import { DemoRaidProgress } from '../components/demo/DemoRaidProgress';
import { DemoRaidResult } from '../components/demo/DemoRaidResult';
import { DemoRaidSidebar } from '../components/demo/DemoRaidSidebar';
import { StatusPill } from '../components/demo/demo-ui';
import { useSmartAccountPay } from '../hooks/useSmartAccountPay.js';
import { humanizeStatus, useRaidDemo } from '../hooks/useRaidDemo';
import heroImage from '../assets/hero.webp';
import { MercenaryLaneBanner } from '../components/demo/MercenaryLaneBanner.js';
import { buildDemoModeChipLabel, buildDemoModeLabel } from '../demo-result';

type DemoPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  embedded?: boolean;
};

export function DemoPage({ providers, providerHealth, embedded = false }: DemoPageProps) {
  const [paidMode, setPaidMode] = useState(false);
  const smartPay = useSmartAccountPay();
  const demo = useRaidDemo({
    providers,
    providerHealth,
    paidMode,
    createFetchWithPayment: smartPay.createFetchWithPayment,
  });

  return (
    <section
      className={`mercenary-demo${embedded ? ' mercenary-demo--embedded' : ''}`}
      id={embedded ? undefined : 'demo'}
    >
      <article className="mercenary-chat">
        <MercenaryLaneBanner mode={demo.demoMode} />
        <div className="mercenary-chat__topbar">
          <div className="mercenary-chat__identity">
            <strong>Mercenary</strong>
            <span>
              {`${buildDemoModeLabel(demo.demoMode)} · ${
                demo.liveRaidRun
                  ? `${humanizeStatus(demo.activeRaidStatus ?? 'queued')} · ${demo.availabilityLabel}`
                  : demo.availabilityLabel
              }`}
            </span>
          </div>

          <div className="mercenary-mode-switch" role="tablist" aria-label="Demo payment mode">
            <button
              className={`mercenary-mode-chip ${!paidMode ? 'mercenary-mode-chip--active' : ''}`}
              onClick={() => setPaidMode(false)}
              type="button"
            >
              free demo
            </button>
            <button
              className={`mercenary-mode-chip ${paidMode ? 'mercenary-mode-chip--active' : ''}`}
              onClick={() => setPaidMode(true)}
              type="button"
            >
              paid x402
            </button>
          </div>

          <div className="mercenary-mode-switch" role="tablist" aria-label="Mercenary lane">
            <button
              aria-selected={demo.demoMode === 'raid'}
              className={`mercenary-mode-chip mercenary-mode-chip--raid${demo.demoMode === 'raid' ? ' mercenary-mode-chip--active' : ''}`}
              onClick={() => demo.handleModeChange('raid')}
              type="button"
            >
              {buildDemoModeChipLabel('raid')}
            </button>
            <button
              aria-selected={demo.demoMode === 'chat_v1'}
              className={`mercenary-mode-chip mercenary-mode-chip--inference${demo.demoMode === 'chat_v1' ? ' mercenary-mode-chip--active' : ''}`}
              onClick={() => demo.handleModeChange('chat_v1')}
              type="button"
            >
              {buildDemoModeChipLabel('chat_v1')}
            </button>
          </div>

          <div className="mercenary-chat__topbar-actions">
            <StatusPill
              tone={
                demo.liveRaidRun
                  ? demo.raidIsTerminal
                    ? 'ready'
                    : 'working'
                  : demo.canLaunchLiveRaid
                    ? 'ready'
                    : 'offline'
              }
            >
              {demo.liveRaidRun
                ? humanizeStatus(demo.activeRaidStatus ?? 'queued')
                : demo.availabilityLabel}
            </StatusPill>
            {demo.hasConversation ? (
              <button
                className="button"
                disabled={demo.isLaunching}
                onClick={demo.resetConversation}
                type="button"
              >
                new chat
              </button>
            ) : null}
          </div>
        </div>

        <div aria-live="polite" className="mercenary-chat__thread" ref={demo.threadRef}>
          <DemoRaidProgress
            activeRaidStatus={demo.activeRaidStatus}
            avatarSrc={heroImage}
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
              avatarSrc={heroImage}
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

        {paidMode ? (
          <div className="mercenary-paid-panel">
            <p className="eyebrow">account subscription</p>
            <p>{smartPay.status}</p>
            <div className="mercenary-action-row">
              <button
                className="button"
                disabled={smartPay.busy}
                onClick={() => void smartPay.connectWallet()}
                type="button"
              >
                connect MetaMask
              </button>
              <button
                className="button button--primary"
                disabled={smartPay.busy}
                onClick={() => void smartPay.grantSubscription()}
                type="button"
              >
                subscribe & top up
              </button>
            </div>
            {smartPay.subscription ? (
              <p>
                ${smartPay.subscription.weeklyBudgetUsd.toFixed(2)} USDC / week tops up prepaid
                credit.
              </p>
            ) : null}
          </div>
        ) : null}

        <DemoRaidForm
          canSendBrief={demo.canSendBrief}
          hasConversation={demo.hasConversation}
          isLaunching={demo.isLaunching}
          liveDemoBrief={demo.liveDemoBrief}
          onBriefChange={demo.setLiveDemoBrief}
          onLaunch={() => void demo.launchConversation()}
          promptSuggestions={demo.promptSuggestions}
        />
      </article>

      <DemoRaidSidebar
        activeRaidStatus={demo.activeRaidStatus}
        attestationSignals={demo.attestationSignals}
        canLaunchLiveRaid={demo.canLaunchLiveRaid}
        compactAvailabilityLabel={demo.compactAvailabilityLabel}
        elapsedLabel={demo.elapsedLabel}
        highlightedSidebarSpecialists={demo.highlightedSidebarSpecialists}
        liveRaidRun={demo.liveRaidRun}
        mercenaryDecisionTrace={demo.mercenaryDecisionTrace}
        onCopyReceiptLink={() => void demo.copyReceiptLink()}
        raidIsTerminal={demo.raidIsTerminal}
        receiptCopied={demo.receiptCopied}
        runSignals={demo.runSignals}
        runtimeAttestation={demo.runtimeAttestation}
        runtimeAttestationError={demo.runtimeAttestationError}
        runtimeAttestationLabel={demo.runtimeAttestationLabel}
        runtimeAttestationSignerDisabled={demo.runtimeAttestationSignerDisabled}
        runtimeAttestationStatus={demo.runtimeAttestationStatus}
        runtimeAttestationTarget={demo.runtimeAttestationTarget}
        runtimeAttestationTee={demo.runtimeAttestationTee}
        runtimeAttestationTone={demo.runtimeAttestationTone}
        showReceiptLinks={demo.showReceiptLinks}
        showResultProofLink={demo.showResultProofLink}
        showTraceLink={demo.showTraceLink}
        showTracePanel={demo.showTracePanel}
        specialistRosterCount={demo.specialistRosterCount}
        specialistTraces={demo.specialistTraces}
        traceEventCount={demo.traceEventCount}
      />
    </section>
  );
}

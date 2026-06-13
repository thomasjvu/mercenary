import type { Provider, ProviderHealth } from '../api';
import { DemoRaidForm } from '../components/demo/DemoRaidForm';
import { DemoRaidProgress } from '../components/demo/DemoRaidProgress';
import { DemoRaidResult } from '../components/demo/DemoRaidResult';
import { DemoRaidSidebar } from '../components/demo/DemoRaidSidebar';
import { StatusPill } from '../components/demo/demo-ui';
import { humanizeStatus, useRaidDemo } from '../hooks/useRaidDemo';
import heroImage from '../assets/hero.webp';
import { buildDemoModeLabel } from '../demo-result';

type DemoPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  embedded?: boolean;
};

export function DemoPage({ providers, providerHealth, embedded = false }: DemoPageProps) {
  const demo = useRaidDemo({ providers, providerHealth });

  return (
    <section
      className={`mercenary-demo${embedded ? ' mercenary-demo--embedded' : ''}`}
      id={embedded ? undefined : 'demo'}
    >
      <article className="mercenary-chat">
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

          <div className="mercenary-mode-switch" role="tablist" aria-label="Demo transport mode">
            <button
              className={`mercenary-mode-chip ${demo.demoMode === 'raid' ? 'mercenary-mode-chip--active' : ''}`}
              onClick={() => demo.handleModeChange('raid')}
              type="button"
            >
              raid chat
            </button>
            <button
              className={`mercenary-mode-chip ${demo.demoMode === 'chat_v1' ? 'mercenary-mode-chip--active' : ''}`}
              onClick={() => demo.handleModeChange('chat_v1')}
              type="button"
            >
              v1 completions
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

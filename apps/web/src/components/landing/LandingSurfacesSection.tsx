import { Icon } from '@iconify/react';
import { FlowTabs } from '../system/FlowTabs.js';
import { TerminalDeck } from '../terminal/TerminalDeck.js';
import {
  HERO_BY_WORKFLOW,
  TERMINAL_PANELS,
  WORKFLOW_STEPS,
  WORKFLOW_TABS,
  WORKFLOW_TAB_ORDER,
  workflowLayerClass,
  type WorkflowTabId,
} from '../../lib/landing-workflow.js';
import type { AppRoute } from '../../lib/app-routes.js';
import type { LandingPageState } from '../../hooks/useLandingPage.js';

type LandingSurfacesSectionProps = {
  state: LandingPageState;
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function LandingSurfacesSection({ state, onNavigate }: LandingSurfacesSectionProps) {
  const { workflowTab, setWorkflowTab, copiedKey, copySnippet, infoPanelRef } = state;
  const primary = HERO_BY_WORKFLOW[workflowTab].primary;

  return (
    <section className="api-grid" id="surfaces">
      <TerminalDeck
        copiedKey={copiedKey}
        defaultPanelId="chat"
        eyebrow="api routes"
        onCopy={(panelId, code) => void copySnippet(panelId, code)}
        panels={TERMINAL_PANELS}
      />

      <aside className="api-notes">
        <section
          className={`info-panel info-panel--compact info-panel--landing-flow info-panel--workflow-${workflowTab}`}
          ref={infoPanelRef}
        >
          <div className="info-panel__head">
            <p className="eyebrow">how it works</p>
            <FlowTabs
              activeId={workflowTab}
              onChange={(id) => setWorkflowTab(id as WorkflowTabId)}
              tabs={WORKFLOW_TABS}
            />
          </div>
          <div className="info-spec-stack workflow-crossfade">
            {WORKFLOW_TAB_ORDER.map((tab) => (
              <div
                aria-hidden={workflowTab !== tab}
                className={`info-spec ${workflowLayerClass(tab, workflowTab)}`}
                key={tab}
              >
                {WORKFLOW_STEPS[tab].map((row) => (
                  <div className="info-spec__row" key={row.label}>
                    <span className="info-spec__label ascii-ripple" data-ascii-ripple>
                      {row.label}
                    </span>
                    <strong className="info-spec__value ascii-ripple" data-ascii-ripple>
                      {row.value}
                    </strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <a
            className="button button--primary info-panel__cta rx-spacebar-clip"
            href={primary.href}
            onClick={(event) => {
              event.preventDefault();
              onNavigate(primary.path, { mode: primary.mode });
            }}
          >
            {primary.icon ? <Icon className="icon icon--pixel" icon={primary.icon} /> : null}
            {primary.label}
          </a>
        </section>
      </aside>
    </section>
  );
}

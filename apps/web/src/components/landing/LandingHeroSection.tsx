import { Icon } from '@iconify/react';
import { LiveMarketPulse } from '../marketplace/LiveMarketPulse.js';
import {
  HERO_BY_WORKFLOW,
  HERO_EYE_GLOWS_BY_WORKFLOW,
  HERO_COLOR_IMAGE_BY_WORKFLOW,
  HERO_MANGA_IMAGE_BY_WORKFLOW,
  HERO_SLICE_POSITIONS,
  WORKFLOW_TAB_ORDER,
  workflowLayerClass,
  type WorkflowTabId,
} from '../../lib/landing-workflow.js';
import type { AppRoute } from '../../lib/app-routes.js';
import type { LandingPageState } from '../../hooks/useLandingPage.js';

type LandingHeroSectionProps = {
  state: LandingPageState;
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function LandingHeroSection({ state, onNavigate }: LandingHeroSectionProps) {
  const { workflowTab } = state;

  return (
    <section className={`hero hero--workflow-${workflowTab}`} id="top">
      <div className="hero__copy">
        <div className="hero__headline-stack workflow-crossfade">
          {WORKFLOW_TAB_ORDER.map((tab) => {
            const tabHero = HERO_BY_WORKFLOW[tab];

            return (
              <h1
                aria-hidden={workflowTab !== tab}
                className={workflowLayerClass(tab, workflowTab)}
                key={tab}
              >
                <span className="hero__headline-line">{tabHero.before}</span>
                <span className="hero__headline-line">
                  <span className="hero__headline-accent">{tabHero.accent}</span>
                </span>
                <span className="hero__headline-line">{tabHero.after}</span>
              </h1>
            );
          })}
        </div>

        <div className="hero__actions-stack workflow-crossfade">
          {WORKFLOW_TAB_ORDER.map((tab) => {
            const tabHero = HERO_BY_WORKFLOW[tab];

            return (
              <div
                aria-hidden={workflowTab !== tab}
                className={`hero__actions ${workflowLayerClass(tab, workflowTab)}`}
                key={tab}
              >
                <a
                  className="button button--primary"
                  href={tabHero.primary.href}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(tabHero.primary.path, { mode: tabHero.primary.mode });
                  }}
                  tabIndex={workflowTab === tab ? 0 : -1}
                >
                  {tabHero.primary.icon ? (
                    <Icon className="icon icon--pixel" icon={tabHero.primary.icon} />
                  ) : null}
                  {tabHero.primary.label}
                </a>
                {tabHero.secondary.map((action) => (
                  <a
                    className="button"
                    href={action.href}
                    key={action.href}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(action.path, { mode: action.mode });
                    }}
                    tabIndex={workflowTab === tab ? 0 : -1}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            );
          })}
        </div>

        <LiveMarketPulse compact />
      </div>

      <LandingHeroArt workflowTab={workflowTab} />
    </section>
  );
}

function LandingHeroArt({ workflowTab }: { workflowTab: WorkflowTabId }) {
  return (
    <div className="hero__art" aria-hidden="true">
      <div className="hero__image-set">
        {HERO_SLICE_POSITIONS.map((position, index) => (
          <div className="hero__slice-frame" key={index}>
            {WORKFLOW_TAB_ORDER.map((tab) => (
              <span
                className={`hero__slice hero__slice-layer ${workflowLayerClass(tab, workflowTab)}`}
                key={tab}
                style={{
                  ['--hero-slice-image-color' as string]: `url("${HERO_COLOR_IMAGE_BY_WORKFLOW[tab]}")`,
                  ['--hero-slice-image-manga' as string]: `url("${HERO_MANGA_IMAGE_BY_WORKFLOW[tab]}")`,
                  ['--hero-slice-position' as string]: `${position}% 50%`,
                }}
              />
            ))}
            {WORKFLOW_TAB_ORDER.map((tab) => (
              <div
                className={`hero__eye-glow-set ${workflowLayerClass(tab, workflowTab)}`}
                key={tab}
              >
                {(HERO_EYE_GLOWS_BY_WORKFLOW[tab][index] ?? []).map((eye, eyeIndex) => (
                  <span
                    className={`hero__eye-glow${eye.variant === 'sensor' ? ' hero__eye-glow--sensor' : ''}`}
                    key={eyeIndex}
                    style={{
                      top: eye.top,
                      left: eye.left,
                      ['--hero-eye-width' as string]: eye.width,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

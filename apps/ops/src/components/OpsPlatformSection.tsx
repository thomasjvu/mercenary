import type { OpsSettings, ProductionReadiness } from '../api';
import {
  OpsMetricsPanel,
  ProductionReadinessPanel,
  SettlementStatusPanel,
} from './OpsReliabilityPanels';
import { OpsSectionHeader } from './ops-visual';
import { X402PaymentsGate } from './ops-ui';

type OpsPlatformSectionProps = {
  settings: OpsSettings['x402'] | undefined;
  settingsLoading: boolean;
  togglePending: boolean;
  toggleError: string | null;
  readiness: ProductionReadiness | undefined;
  onRequestEnable: () => void;
  onRequestDisable: () => void;
};

export function OpsPlatformSection({
  settings,
  settingsLoading,
  togglePending,
  toggleError,
  readiness,
  onRequestEnable,
  onRequestDisable,
}: OpsPlatformSectionProps) {
  const blockingChecks =
    readiness?.checks.filter((check) => check.status === 'fail' && check.severity === 'blocking') ??
    [];

  return (
    <section className="ops-platform-section" id="platform">
      <OpsSectionHeader icon="platform" title="Platform gates" />

      <X402PaymentsGate
        blockingChecks={blockingChecks}
        disabled={togglePending || settingsLoading}
        enabled={settings?.enabled ?? false}
        error={toggleError}
        settings={settings}
        onRequestDisable={onRequestDisable}
        onRequestEnable={onRequestEnable}
      />

      <section className="ops-reliability">
        <ProductionReadinessPanel />
        <SettlementStatusPanel />
        <OpsMetricsPanel />
      </section>
    </section>
  );
}

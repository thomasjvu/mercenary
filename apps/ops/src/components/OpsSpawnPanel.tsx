import { DocsButton } from '@bossraid/ui';
import { SPAWN_PAYLOAD_PRESETS } from '../default-payload';

type OpsSpawnPanelProps = {
  spawnPayload: string;
  spawnError: string | null;
  onPayloadChange: (value: string) => void;
};

export function OpsSpawnPanel({ spawnPayload, spawnError, onPayloadChange }: OpsSpawnPanelProps) {
  const activePreset =
    SPAWN_PAYLOAD_PRESETS.find((preset) => preset.payload === spawnPayload)?.id ?? 'custom';

  return (
    <article className="ops-panel ops-panel--payload">
      <div className="panel-head">
        <div>
          <p className="ops-label">payload</p>
          <h3>Launch spec</h3>
        </div>
        <div className="ops-payload-presets">
          {SPAWN_PAYLOAD_PRESETS.map((preset) => (
            <button
              className={`button button--compact${activePreset === preset.id ? ' button--primary' : ''}`}
              key={preset.id}
              onClick={() => onPayloadChange(preset.payload)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
          <DocsButton className="button ops-docs-button ops-docs-button--compact" />
        </div>
      </div>
      <textarea
        className="payload-editor"
        spellCheck={false}
        value={spawnPayload}
        onChange={(event) => onPayloadChange(event.target.value)}
      />
      {spawnError ? (
        <p className="error-note">{spawnError}</p>
      ) : (
        <p className="quiet-note">Native raid request body.</p>
      )}
    </article>
  );
}

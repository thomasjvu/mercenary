import { DocsButton } from '@bossraid/ui';

type OpsSpawnPanelProps = {
  spawnPayload: string;
  spawnError: string | null;
  onPayloadChange: (value: string) => void;
};

export function OpsSpawnPanel({ spawnPayload, spawnError, onPayloadChange }: OpsSpawnPanelProps) {
  return (
    <article className="ops-panel ops-panel--payload">
      <div className="panel-head">
        <div>
          <p className="ops-label">payload</p>
          <h3>Launch spec</h3>
        </div>
        <DocsButton className="button ops-docs-button ops-docs-button--compact" />
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

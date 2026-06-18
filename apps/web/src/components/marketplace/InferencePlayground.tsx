import { FormField, FormInput, FormSelect } from '../system/FormField.js';
import { UserErrorNote } from '../system/UserErrorNote.js';
import { TerminalCodePanel } from '../terminal/TerminalCodePanel.js';
import { useInferencePlayground } from '../../hooks/useInferencePlayground.js';
import { ModelCombobox } from './ModelCombobox.js';
import { ProviderCombobox } from './ProviderCombobox.js';

type InferencePlaygroundProps = {
  initialModelId?: string;
};

export function InferencePlayground({ initialModelId }: InferencePlaygroundProps) {
  const state = useInferencePlayground({ initialModelId });

  return (
    <section className="inference-playground inference-playground--compact">
      <div className="inference-playground__layout">
        <div className="page-panel inference-playground__panel">
          <div className="inference-playground__field-grid">
            <FormField label="provider">
              <ProviderCombobox
                onChange={state.setProviderFilter}
                options={state.providerChoices}
                placeholder={state.providerPlaceholder}
                value={state.providerFilter}
              />
            </FormField>

            <FormField label="model">
              <ModelCombobox
                onChange={state.setModel}
                options={state.filteredModelOptions}
                placeholder={state.modelPlaceholder}
                value={state.model}
              />
            </FormField>

            <FormSelect
              label="privacy"
              onChange={(event) => state.setPrivacyMode(event.target.value as 'prefer' | 'strict')}
              options={[...state.privacyModeOptions]}
              value={state.privacyMode}
            />

            <FormInput
              inputMode="decimal"
              label="budget usd"
              onChange={(event) => state.setMaxBudget(event.target.value)}
              value={state.maxBudget}
            />
          </div>

          <p className="inference-playground__meta" aria-live="polite">
            {state.modelSummary}
          </p>

          <details className="inference-playground__advanced">
            <summary>credentials</summary>
            <div className="inference-playground__field-grid inference-playground__field-grid--stack">
              {state.savedApiKeys.length > 0 ? (
                <FormSelect
                  label="saved api key"
                  onChange={(event) => state.selectSavedApiKey(event.target.value)}
                  options={[
                    ['', 'select a saved key'],
                    ...state.savedApiKeys.map(
                      (entry) => [entry.id, `${entry.name} (${entry.prefix})`] as const
                    ),
                  ]}
                  value={state.selectedApiKeyId}
                />
              ) : null}
              <FormInput
                autoComplete="off"
                label="buyer API key"
                onChange={(event) => {
                  state.setApiKey(event.target.value);
                  if (
                    state.selectedApiKeyId &&
                    event.target.value !==
                      state.savedApiKeys.find((entry) => entry.id === state.selectedApiKeyId)
                        ?.apiKey
                  ) {
                    state.selectSavedApiKey('');
                  }
                }}
                placeholder="br_..."
                spellCheck={false}
                type="password"
                value={state.apiKey}
              />
              <FormInput
                autoComplete="off"
                className={`field${state.selectedModel?.e2ee ? '' : ' field--inactive'}`}
                disabled={!state.selectedModel?.e2ee}
                label="upstream key (E2EE)"
                onChange={(event) => state.setUpstreamApiKey(event.target.value)}
                placeholder={state.selectedModel?.e2ee ? 'required for strict E2EE' : 'E2EE only'}
                spellCheck={false}
                type="password"
                value={state.upstreamApiKey}
              />
            </div>
          </details>

          <label className="inference-playground__prompt">
            <span>prompt</span>
            <textarea
              className="inference-playground__textarea"
              onChange={(event) => state.setPrompt(event.target.value)}
              placeholder="Describe the request you want routed through the marketplace…"
              rows={4}
              value={state.prompt}
            />
          </label>

          <div className="inference-playground__actions">
            <button
              className="button button--primary rx-spacebar-clip"
              disabled={state.pending}
              onClick={() => void state.handleRun()}
              type="button"
            >
              {state.pending ? 'routing...' : 'run request'}
            </button>
            {state.teeStatus ? (
              <span className="inference-playground__status">{state.teeStatus}</span>
            ) : null}
          </div>

          {state.error ? (
            <UserErrorNote variant={state.error.variant}>{state.error.message}</UserErrorNote>
          ) : null}
          {state.responseText ? (
            <article className="inference-playground__response">
              <p className="eyebrow">assistant</p>
              <pre>{state.responseText}</pre>
            </article>
          ) : null}
        </div>

        <aside className="inference-playground__aside">
          <section className="inference-playground__trust-card page-panel">
            <p className="eyebrow">attestation</p>
            {state.selectedModel &&
            (state.selectedModel.teeAttested || state.selectedModel.e2ee) ? (
              <div className="inference-playground__trust-copy">
                <strong>{state.selectedModel.teeAttested ? 'TEE attested' : 'E2EE lane'}</strong>
                <p>
                  {state.attestationProvider} · {state.model || 'model pending'}
                </p>
                <p>Verification runs before each request when TEE or strict E2EE is active.</p>
              </div>
            ) : (
              <p className="inference-playground__trust-copy">
                Standard routing. Select a TEE or E2EE model to inspect upstream proof requirements.
              </p>
            )}
          </section>

          <div className="terminal-deck inference-playground__deck">
            <div className="terminal-deck__header">
              <p className="eyebrow">request</p>
              <div className="terminal-deck__tabs" role="tablist" aria-label="Playground output">
                <button
                  className={`deck-tab deck-tab--chat ${state.activePanel === 'curl' ? 'deck-tab--active' : ''}`}
                  onClick={() => state.setActivePanel('curl')}
                  type="button"
                >
                  curl
                </button>
                <button
                  className={`deck-tab deck-tab--raid ${state.activePanel === 'response' ? 'deck-tab--active' : ''}`}
                  onClick={() => state.setActivePanel('response')}
                  type="button"
                >
                  response
                </button>
              </div>
            </div>
            <div className="terminal-stack">
              <TerminalCodePanel
                label="curl"
                note="openai-compatible"
                code={state.curlSnippet}
                theme="chat"
                layer={state.activePanel === 'curl' ? 'front' : 'mid'}
                onFocus={() => state.setActivePanel('curl')}
                actionLabel={state.copiedKey === 'curl-panel' ? 'copied' : 'copy'}
                onAction={() => void state.copySnippet('curl-panel', state.curlSnippet)}
              />
              <TerminalCodePanel
                label="response"
                note="seller metadata"
                code={state.responseSnippet}
                theme="raid"
                layer={state.activePanel === 'response' ? 'front' : 'back'}
                onFocus={() => state.setActivePanel('response')}
                actionLabel={
                  state.rawResponse && state.copiedKey === 'response-panel' ? 'copied' : 'copy'
                }
                onAction={
                  state.rawResponse
                    ? () => void state.copySnippet('response-panel', state.responseSnippet)
                    : undefined
                }
              />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

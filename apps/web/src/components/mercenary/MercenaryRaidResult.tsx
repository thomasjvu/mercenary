import type { SubmissionArtifact } from '@bossraid/shared-types';
import { isLowSignalChatPrompt } from '../../mercenary-chat.js';
import { useArtifactLightbox } from '../../hooks/useArtifactLightbox.js';
import { ArtifactGallery } from './ArtifactGallery.js';
import { ArtifactLightbox } from './ArtifactLightbox.js';
import { ChatMessage } from './mercenary-ui';

type MercenaryRaidResultProps = {
  lastSubmittedBrief: string | null;
  liveResultText?: string;
  liveExplanation?: string;
  livePatch?: string;
  liveArtifacts: SubmissionArtifact[];
  directResponse?: boolean;
  hasLiveRun: boolean;
  raidIsTerminal: boolean;
  completedAt?: string;
  expandedArtifact: SubmissionArtifact | null;
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
  onCloseArtifact: () => void;
  onCopyReceiptLink?: () => void;
  onViewReceipt?: () => void;
  receiptCopied?: boolean;
  receiptPath?: string | null;
};

export function MercenaryRaidResult({
  lastSubmittedBrief,
  liveResultText,
  liveExplanation,
  livePatch,
  liveArtifacts,
  directResponse,
  hasLiveRun,
  raidIsTerminal,
  completedAt,
  expandedArtifact,
  onOpenArtifact,
  onCloseArtifact,
  onCopyReceiptLink,
  receiptCopied = false,
  receiptPath,
}: MercenaryRaidResultProps) {
  useArtifactLightbox(expandedArtifact, onCloseArtifact);

  return (
    <>
      {liveResultText || liveArtifacts.length > 0 || livePatch ? (
        <ChatMessage role="assistant" tone="success" timestamp={completedAt}>
          {liveResultText ? (
            <p className="mercenary-final__answer">{liveResultText}</p>
          ) : (
            <p>Final delivery is ready.</p>
          )}
          {liveExplanation && !liveResultText ? <p>{liveExplanation}</p> : null}
          {!directResponse ? (
            <p className="mercenary-message__note">
              Returned through `/v1/chat/completions` and linked back to the same raid receipt and
              trace.
            </p>
          ) : null}

          {liveArtifacts.length > 0 ? (
            <ArtifactGallery artifacts={liveArtifacts} onOpenArtifact={onOpenArtifact} />
          ) : null}

          {livePatch ? <pre className="code-panel mercenary-final__code">{livePatch}</pre> : null}

          {raidIsTerminal && receiptPath ? (
            <div className="mercenary-receipt-cta">
              <a className="button button--primary" href={receiptPath}>
                view receipt
              </a>
              {onCopyReceiptLink ? (
                <button className="button" onClick={onCopyReceiptLink} type="button">
                  {receiptCopied ? 'copied' : 'copy receipt link'}
                </button>
              ) : null}
            </div>
          ) : null}
        </ChatMessage>
      ) : null}

      {hasLiveRun &&
      raidIsTerminal &&
      !liveResultText &&
      liveArtifacts.length === 0 &&
      !livePatch ? (
        <ChatMessage role="assistant" tone="error" timestamp={completedAt}>
          <p>Mercenary did not get an approved specialist deliverable for this request.</p>
          <p className="mercenary-message__note">
            {isLowSignalChatPrompt(lastSubmittedBrief ?? '')
              ? 'Short greetings usually stay conversational. Ask a concrete question or scoped task if you want specialist output.'
              : 'Try rephrasing the request more concretely with clearer deliverables.'}
          </p>
        </ChatMessage>
      ) : null}

      {expandedArtifact ? (
        <ArtifactLightbox artifact={expandedArtifact} onClose={onCloseArtifact} />
      ) : null}
    </>
  );
}

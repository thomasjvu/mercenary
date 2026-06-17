import { LegalCharacterVideo } from '../system/LegalCharacterVideo.js';

export function VerificationBackdrop() {
  return (
    <div aria-hidden="true" className="verification-page__backdrop">
      <div className="verification-page__backdrop-video">
        <span className="legal-page__character-aura legal-page__character-aura--core" />
        <LegalCharacterVideo className="legal-page__character-video" />
      </div>
    </div>
  );
}

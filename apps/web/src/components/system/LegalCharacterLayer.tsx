import { LegalCharacterVideo } from './LegalCharacterVideo.js';

export function LegalCharacterLayer() {
  return (
    <div aria-hidden="true" className="legal-page__character">
      <span className="legal-page__character-aura legal-page__character-aura--core" />
      <LegalCharacterVideo className="legal-page__character-video" />
    </div>
  );
}

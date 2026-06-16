import mercenaryFlying from '../../assets/legal/mercenary-legal-float.webm';

export function LegalCharacterLayer() {
  return (
    <div aria-hidden="true" className="legal-page__character">
      <video
        autoPlay
        className="legal-page__character-video"
        loop
        muted
        playsInline
        preload="metadata"
        src={mercenaryFlying}
      />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import mercenaryFlying from '../../assets/legal/mercenary-legal-float.webm';

const LOOP_TRIM_SECONDS = 0.04;

export function LegalCharacterLayer() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleTimeUpdate = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= LOOP_TRIM_SECONDS) {
        return;
      }

      if (video.currentTime >= duration - LOOP_TRIM_SECONDS) {
        video.currentTime = 0;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, []);

  return (
    <div aria-hidden="true" className="legal-page__character">
      <span className="legal-page__character-aura legal-page__character-aura--core" />
      <video
        ref={videoRef}
        autoPlay
        className="legal-page__character-video"
        loop
        muted
        playsInline
        preload="auto"
        src={mercenaryFlying}
      />
    </div>
  );
}

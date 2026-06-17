import { useEffect, useRef } from 'react';
import mercenaryFlying from '../../assets/legal/mercenary-legal-float.webm';

const LOOP_TRIM_SECONDS = 0.04;

type LegalCharacterVideoProps = {
  className?: string;
};

export function LegalCharacterVideo({ className }: LegalCharacterVideoProps) {
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
    <video
      ref={videoRef}
      autoPlay
      className={className}
      loop
      muted
      playsInline
      preload="auto"
      src={mercenaryFlying}
    />
  );
}

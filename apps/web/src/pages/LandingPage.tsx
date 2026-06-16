import { LandingHeroSection } from '../components/landing/LandingHeroSection.js';
import { LandingSurfacesSection } from '../components/landing/LandingSurfacesSection.js';
import { useLandingPage } from '../hooks/useLandingPage.js';
import type { AppRoute } from '../lib/app-routes.js';

type LandingPageProps = {
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function LandingPage({ onNavigate }: LandingPageProps) {
  const state = useLandingPage();

  return (
    <>
      <LandingHeroSection onNavigate={onNavigate} state={state} />
      <LandingSurfacesSection onNavigate={onNavigate} state={state} />
    </>
  );
}

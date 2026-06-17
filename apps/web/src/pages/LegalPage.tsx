import { AcceptableUsePolicyContent } from '../content/legal/AcceptableUsePolicyContent.js';
import { PrivacyPolicyContent } from '../content/legal/PrivacyPolicyContent.js';
import { TermsOfServiceContent } from '../content/legal/TermsOfServiceContent.js';
import { LegalCharacterLayer } from '../components/system/LegalCharacterLayer.js';
import { PageIntro } from '../components/system/PageIntro.js';
import type { AppRoute } from '../lib/app-routes.js';

export type LegalPageKind = 'terms' | 'privacy' | 'aup';

const LEGAL_PAGES = {
  terms: {
    title: 'Terms of Service',
    updated: 'June 16, 2026',
    Content: TermsOfServiceContent,
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 16, 2026',
    Content: PrivacyPolicyContent,
  },
  aup: {
    title: 'Acceptable Use Policy',
    updated: 'June 16, 2026',
    Content: AcceptableUsePolicyContent,
  },
} as const;

type LegalPageProps = {
  kind: LegalPageKind;
  onNavigate: (path: AppRoute) => void;
};

export function LegalPage({ kind, onNavigate }: LegalPageProps) {
  const page = LEGAL_PAGES[kind];
  const Content = page.Content;

  return (
    <section className="page-shell page-flat legal-page">
      <div className="legal-page__content">
        <header className="legal-page__header">
          <PageIntro title={page.title} />
          <p className="legal-document__meta">Last updated: {page.updated}</p>
        </header>
        <Content onNavigate={onNavigate} />
      </div>
      <LegalCharacterLayer />
    </section>
  );
}

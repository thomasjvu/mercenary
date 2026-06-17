import { ChangelogReleaseArticle } from '../components/changelog/ChangelogReleaseArticle.js';
import { ChangelogVersionNav } from '../components/changelog/ChangelogVersionNav.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { CHANGELOG_UPDATED } from '../content/changelog.js';
import { findChangelogRelease } from '../lib/changelog.js';
import { APP_RELEASE_CHANNEL, APP_VERSION } from '../lib/release.js';

type ChangelogReleasePageProps = {
  version: string;
};

export function ChangelogReleasePage({ version }: ChangelogReleasePageProps) {
  const release = findChangelogRelease(version);

  if (!release) {
    return (
      <section className="page-shell page-flat changelog-page">
        <header className="changelog-page__header">
          <PageIntro title="Changelog" />
          <p className="changelog-page__meta">Unknown release v{version}.</p>
        </header>
        <p className="changelog-page__empty">
          <a href="/changelog">Back to changelog</a>
        </p>
      </section>
    );
  }

  return (
    <section className="page-shell page-flat changelog-page">
      <header className="changelog-page__header">
        <PageIntro title={`v${release.version}`} />
        <p className="changelog-page__meta">
          <a className="changelog-page__back" href="/changelog">
            Changelog
          </a>
          {' · '}
          Boss Raid {APP_VERSION} {APP_RELEASE_CHANNEL} · Last updated: {CHANGELOG_UPDATED}
        </p>
      </header>

      <div className="changelog-feed">
        <ChangelogReleaseArticle release={release} />
      </div>

      <ChangelogVersionNav activeVersion={release.version} />
    </section>
  );
}

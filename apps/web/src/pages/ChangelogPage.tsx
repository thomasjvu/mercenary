import { CHANGELOG_RELEASES, CHANGELOG_UPDATED } from '../content/changelog.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { APP_RELEASE_CHANNEL, APP_VERSION } from '../lib/release.js';

export function ChangelogPage() {
  return (
    <section className="page-shell page-flat changelog-page">
      <header className="changelog-page__header">
        <PageIntro title="Changelog" />
        <p className="changelog-page__meta">
          Boss Raid {APP_VERSION} {APP_RELEASE_CHANNEL} · Last updated: {CHANGELOG_UPDATED}
        </p>
      </header>

      <div className="changelog-feed">
        {CHANGELOG_RELEASES.map((release) => (
          <article className="changelog-release" key={`${release.version}-${release.date}`}>
            <header className="changelog-release__head">
              <div className="changelog-release__version">
                <span className="changelog-release__version-label">v{release.version}</span>
                <span className="changelog-release__channel">{release.channel}</span>
              </div>
              <time className="changelog-release__date" dateTime={release.date}>
                {release.date}
              </time>
            </header>
            <p className="changelog-release__summary">{release.summary}</p>
            <div className="changelog-release__sections">
              {release.sections.map((section) => (
                <section className="changelog-release__section" key={section.title}>
                  <h2>{section.title}</h2>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

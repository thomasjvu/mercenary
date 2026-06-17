import { CHANGELOG_RELEASES, CHANGELOG_UPDATED } from '../content/changelog.js';
import { PageIntro } from '../components/system/PageIntro.js';
import {
  APP_RELEASE_CHANNEL,
  APP_VERSION,
  releaseAnchorId,
  releaseTagUrl,
} from '../lib/release.js';

export function ChangelogPage() {
  return (
    <section className="page-shell page-flat changelog-page">
      <header className="changelog-page__header">
        <PageIntro title="Changelog" />
        <p className="changelog-page__meta">
          Boss Raid {APP_VERSION} {APP_RELEASE_CHANNEL} · Last updated: {CHANGELOG_UPDATED}
        </p>
      </header>

      <nav aria-label="Changelog versions" className="changelog-toc">
        <h2 className="changelog-toc__title">Versions</h2>
        <ol className="changelog-toc__list">
          {CHANGELOG_RELEASES.map((release) => {
            const anchorId = releaseAnchorId(release.version);
            return (
              <li className="changelog-toc__item" key={release.version}>
                <a className="changelog-toc__link" href={`#${anchorId}`}>
                  v{release.version}
                </a>
                <span className="changelog-toc__date">{release.date}</span>
                {release.gitTag ? (
                  <a
                    className="changelog-toc__tag"
                    href={releaseTagUrl(release.gitTag)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {release.gitTag}
                  </a>
                ) : (
                  <span className="changelog-toc__tag changelog-toc__tag--pending">
                    tag pending
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="changelog-feed">
        {CHANGELOG_RELEASES.map((release) => {
          const anchorId = releaseAnchorId(release.version);
          return (
            <article
              className="changelog-release"
              id={anchorId}
              key={`${release.version}-${release.date}`}
            >
              <header className="changelog-release__head">
                <div className="changelog-release__version">
                  {release.gitTag ? (
                    <a
                      className="changelog-release__version-label changelog-release__version-link"
                      href={releaseTagUrl(release.gitTag)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      v{release.version}
                    </a>
                  ) : (
                    <span className="changelog-release__version-label">v{release.version}</span>
                  )}
                  <span className="changelog-release__channel">{release.channel}</span>
                  {!release.gitTag ? (
                    <span className="changelog-release__tag-pending">tag pending</span>
                  ) : (
                    <a
                      className="changelog-release__tag-link"
                      href={releaseTagUrl(release.gitTag)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {release.gitTag}
                    </a>
                  )}
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
          );
        })}
      </div>
    </section>
  );
}

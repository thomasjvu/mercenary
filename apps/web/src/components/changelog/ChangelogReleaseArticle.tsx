import type { ChangelogRelease } from '../../content/changelog.js';
import { releaseTagUrl } from '../../lib/release.js';

type ChangelogReleaseArticleProps = {
  release: ChangelogRelease;
};

export function ChangelogReleaseArticle({ release }: ChangelogReleaseArticleProps) {
  return (
    <article className="changelog-release">
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
}

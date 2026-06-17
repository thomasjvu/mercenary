import { CHANGELOG_RELEASES } from '../../content/changelog.js';
import { changelogVersionPath } from '../../lib/changelog.js';
import { releaseTagUrl } from '../../lib/release.js';

type ChangelogVersionNavProps = {
  activeVersion?: string;
};

export function ChangelogVersionNav({ activeVersion }: ChangelogVersionNavProps) {
  return (
    <nav aria-label="Changelog versions" className="changelog-toc">
      <h2 className="changelog-toc__title">Versions</h2>
      <ol className="changelog-toc__list">
        {CHANGELOG_RELEASES.map((release) => {
          const isActive = release.version === activeVersion;
          return (
            <li
              className={`changelog-toc__item${isActive ? ' changelog-toc__item--active' : ''}`}
              key={release.version}
            >
              {isActive ? (
                <span
                  aria-current="page"
                  className="changelog-toc__link changelog-toc__link--active"
                >
                  v{release.version}
                </span>
              ) : (
                <a className="changelog-toc__link" href={changelogVersionPath(release.version)}>
                  v{release.version}
                </a>
              )}
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
                <span className="changelog-toc__tag changelog-toc__tag--pending">tag pending</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

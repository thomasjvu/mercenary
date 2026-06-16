import type { ReactNode } from 'react';

type PageIntroProps = {
  title?: string;
  aside?: ReactNode;
  actions?: ReactNode;
};

export function PageIntro({ title, aside, actions }: PageIntroProps) {
  if (!title && !aside && !actions) {
    return null;
  }

  return (
    <header className={`page-intro${title ? '' : ' page-intro--tools-only'}`}>
      {title ? <h1>{title}</h1> : null}
      {aside || actions ? (
        <div className="page-intro__tools">
          {aside}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

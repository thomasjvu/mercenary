import type { ReactNode } from 'react';

type PageIntroProps = {
  title: string;
  aside?: ReactNode;
  actions?: ReactNode;
};

export function PageIntro({ title, aside, actions }: PageIntroProps) {
  return (
    <header className="page-intro">
      <h1>{title}</h1>
      {aside || actions ? (
        <div className="page-intro__tools">
          {aside}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

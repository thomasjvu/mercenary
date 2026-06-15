import type { ReactNode } from 'react';

type PageHeroProps = {
  eyebrow: ReactNode;
  title: string;
  lede?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  compact?: boolean;
};

export function PageHero({ eyebrow, title, lede, actions, aside, compact }: PageHeroProps) {
  return (
    <header className={`page-hero${compact ? ' page-hero--compact' : ''}`}>
      <div className="page-hero__main">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
        {actions ? <div className="page-hero__actions">{actions}</div> : null}
      </div>
      {aside ? <div className="page-hero__aside">{aside}</div> : null}
    </header>
  );
}

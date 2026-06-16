import type { ReactNode } from 'react';

type RefinePanelProps = {
  title?: string;
  countLabel?: string;
  isActive?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  children: ReactNode;
  className?: string;
  headClassName?: string;
  titleClassName?: string;
  resetClassName?: string;
  countClassName?: string;
  'aria-label'?: string;
};

export function RefinePanel({
  title = 'Refine',
  countLabel,
  isActive = false,
  onReset,
  resetLabel = 'clear',
  children,
  className = 'market-filters',
  headClassName = 'market-filters__head',
  titleClassName = 'market-filters__title',
  resetClassName = 'market-filters__reset',
  countClassName,
  'aria-label': ariaLabel = 'Search and filters',
}: RefinePanelProps) {
  return (
    <aside aria-label={ariaLabel} className={className}>
      <div className={headClassName}>
        <p className={titleClassName}>{title}</p>
        {countLabel || (isActive && onReset) ? (
          <div className="market-filters__head-actions raiders-directory__head-actions">
            {isActive && onReset ? (
              <button className={resetClassName} onClick={onReset} type="button">
                {resetLabel}
              </button>
            ) : null}
            {countLabel ? (
              <p className={countClassName ?? 'raiders-directory__count'}>{countLabel}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </aside>
  );
}

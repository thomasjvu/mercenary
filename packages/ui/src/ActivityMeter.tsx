import type { ReactNode } from 'react';
import { cssCustomProperty } from './css-vars.js';

type ActivityMeterProps = {
  barCount: number;
  litBars?: number;
  className?: string;
  trackClassName?: string;
  barClassName?: string;
  litBarClassName?: string;
  ariaLabel?: string;
  children?: ReactNode;
};

export function ActivityMeter({
  barCount,
  litBars = 0,
  className,
  trackClassName = 'activity-meter__track',
  barClassName = 'activity-meter__bar',
  litBarClassName = 'activity-meter__bar--on',
  ariaLabel,
  children,
}: ActivityMeterProps) {
  return (
    <div aria-label={ariaLabel} className={className}>
      {children}
      <div aria-hidden="true" className={trackClassName}>
        {Array.from({ length: barCount }, (_, index) => (
          <span
            className={`${barClassName}${index < litBars ? ` ${litBarClassName}` : ''}`}
            key={index}
            style={cssCustomProperty('--meter-index', index)}
          />
        ))}
      </div>
    </div>
  );
}

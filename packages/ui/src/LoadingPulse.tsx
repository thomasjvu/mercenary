import { cssCustomProperty } from './css-vars.js';

type LoadingPulseProps = {
  label?: string;
  lines?: number;
  className?: string;
};

export function LoadingPulse({
  label = 'fetching',
  lines = 3,
  className = 'loading-pulse',
}: LoadingPulseProps) {
  return (
    <div aria-busy="true" aria-label={label} className={className} role="status">
      <span className="loading-pulse__label">{label}</span>
      <div className="loading-pulse__bars">
        {Array.from({ length: lines }, (_, index) => (
          <span
            className="loading-pulse__bar"
            key={index}
            style={cssCustomProperty('--pulse-index', index)}
          />
        ))}
      </div>
    </div>
  );
}

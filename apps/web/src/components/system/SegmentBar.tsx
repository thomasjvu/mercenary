type SegmentBarTone = 'ref' | 'market' | 'savings' | 'volume';

type SegmentBarProps = {
  value: number;
  segments?: number;
  tone?: SegmentBarTone;
  className?: string;
};

export function SegmentBar({ value, segments = 28, tone = 'market', className }: SegmentBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const litCount = Math.max(0, Math.min(segments, Math.round((clamped / 100) * segments)));

  return (
    <div
      className={`rx-segment-bar rx-segment-bar--${tone}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{ ['--segment-count' as string]: String(segments) }}
    >
      {Array.from({ length: segments }, (_, index) => (
        <span
          className={`rx-segment-bar__block${index < litCount ? ' rx-segment-bar__block--lit' : ''}`}
          key={index}
        />
      ))}
    </div>
  );
}

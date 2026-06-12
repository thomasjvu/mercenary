type BossRaidMarkProps = {
  compact?: boolean;
};

export function BossRaidMark({ compact = false }: BossRaidMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`boss-raid-mark${compact ? ' boss-raid-mark--compact' : ''}`}
    >
      BR
    </span>
  );
}

type BossRaidMarkProps = {
  compact?: boolean;
};

export function BossRaidMark({ compact = false }: BossRaidMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`boss-raid-mark${compact ? ' boss-raid-mark--compact' : ''}`}
    >
      <svg
        aria-hidden="true"
        className="boss-raid-mark__svg"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="transparent" height="32" width="32" />
        <path d="M3 20 9 8 11 13 18 4 15 10 24 6 12 22 8 17Z" fill="var(--rx-yellow)" />
        <path d="M4 18 8 12 10 15 6 20Z" fill="var(--rx-white)" opacity="0.9" />
        <path d="M6 25 21 9 24 12 9 27Z" fill="var(--rx-blue)" />
        <path d="M8 23 12 16 14 18 10 24Z" fill="var(--rx-red)" />
        <path d="M15 11 19 7 21 9 17 13Z" fill="var(--rx-yellow)" />
        <path d="M22 7 27 5 25 9Z" fill="var(--rx-white)" opacity="0.85" />
        <path
          d="M2 19 5 16M2 22 6 20M4 24 8 22M6 26 10 24"
          stroke="var(--rx-yellow)"
          strokeLinecap="square"
          strokeWidth="1.1"
        />
        <circle cx="7.5" cy="20.5" fill="var(--rx-white)" r="1.8" />
        <circle cx="7.5" cy="20.5" fill="var(--rx-blue)" opacity="0.55" r="0.9" />
      </svg>
    </span>
  );
}

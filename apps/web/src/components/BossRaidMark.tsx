import { BOSS_RAID_MARK_PATHS } from './boss-raid-mark-paths.js';

type BossRaidMarkProps = {
  compact?: boolean;
};

export function BossRaidMark({ compact = false }: BossRaidMarkProps) {
  const p = BOSS_RAID_MARK_PATHS;

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
        <path d={p.blue} fill="var(--rx-blue)" />
        <path d={p.yellowMain} fill="var(--rx-yellow)" />
        <path d={p.yellowWedge} fill="var(--rx-yellow)" />
        <path
          d={p.yellowLines}
          fill="none"
          stroke="var(--rx-yellow)"
          strokeLinecap="square"
          strokeWidth="1.1"
        />
        <path d={p.whiteAccent} fill="var(--rx-white)" opacity="0.9" />
        <path d={p.whiteHorn} fill="var(--rx-white)" opacity="0.85" />
        <path d={p.red} fill="var(--rx-red)" />
        <circle cx="7.5" cy="20.5" fill="var(--rx-white)" r="1.8" />
        <circle cx="7.5" cy="20.5" fill="var(--rx-blue)" opacity="0.55" r="0.9" />
      </svg>
    </span>
  );
}

import type { CSSProperties } from 'react';
import useSWR from 'swr';
import { fetchMarkets } from '../../api/marketplace.js';

const XP_PER_LEVEL = 24;
const BAR_COUNT = 10;

function readQuestLevel(routed24h: number): number {
  return Math.max(1, Math.min(99, Math.floor(routed24h / XP_PER_LEVEL) + 1));
}

function readQuestXpFill(routed24h: number): number {
  const remainder = routed24h % XP_PER_LEVEL;
  return Math.min(100, Math.round((remainder / XP_PER_LEVEL) * 100));
}

export function QuestXpMeter() {
  const markets = useSWR('landing-quest-xp', () => fetchMarkets(), { refreshInterval: 30_000 });
  const routed24h = markets.data?.stats?.routedRequests24h ?? 0;
  const level = readQuestLevel(routed24h);
  const fill = readQuestXpFill(routed24h);
  const litBars = Math.round((fill / 100) * BAR_COUNT);

  return (
    <div aria-label={`Raid queue level ${level}`} className="quest-xp-meter">
      <div className="quest-xp-meter__meta">
        <span className="quest-xp-meter__label">raid lv</span>
        <strong className="quest-xp-meter__level">{level}</strong>
      </div>
      <div className="quest-xp-meter__track" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            className={`quest-xp-meter__bar ${index < litBars ? 'quest-xp-meter__bar--on' : ''}`}
            key={index}
            style={{ '--meter-index': index } as CSSProperties}
          />
        ))}
      </div>
      <span className="quest-xp-meter__caption">{routed24h} routed / 24h</span>
    </div>
  );
}

import { Icon } from '@iconify/react';

export function PartyQuestLockup() {
  return (
    <div aria-label="Boss Raid x Party Quest" className="party-quest-lockup">
      <span className="party-quest-lockup__tile party-quest-lockup__tile--br" aria-hidden="true">
        BR
      </span>
      <div className="party-quest-lockup__copy">
        <p className="party-quest-lockup__title">Boss Raid</p>
        <p className="party-quest-lockup__join">
          <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:cross-solid" />
          <span>Party Quest</span>
        </p>
      </div>
      <span className="party-quest-lockup__tile party-quest-lockup__tile--pq" aria-hidden="true">
        PQ
      </span>
    </div>
  );
}

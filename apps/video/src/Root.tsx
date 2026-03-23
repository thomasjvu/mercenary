import { Composition } from "remotion";
import { BossRaidMercenaryVideo, bossRaidMercenaryDuration } from "./BossRaidMercenaryVideo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="BossRaidMercenary"
      component={BossRaidMercenaryVideo}
      durationInFrames={bossRaidMercenaryDuration}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

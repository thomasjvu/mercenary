import type { CSSProperties, PropsWithChildren } from "react";
import { loadFont as loadMonoFont } from "@remotion/google-fonts/IBMPlexMono";
import { loadFont as loadDisplayFont } from "@remotion/google-fonts/Sora";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const { fontFamily: displayFont } = loadDisplayFont("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

const { fontFamily: monoFont } = loadMonoFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const heroImage = staticFile("hero.png");

const colors = {
  accent: "#f58a3a",
  accentSoft: "rgba(245, 138, 58, 0.2)",
  bg: "#07090d",
  bgAlt: "#0d1218",
  cyan: "#5fdbff",
  cyanSoft: "rgba(95, 219, 255, 0.18)",
  green: "#58f3a2",
  greenSoft: "rgba(88, 243, 162, 0.16)",
  line: "rgba(255, 255, 255, 0.08)",
  lineStrong: "rgba(255, 255, 255, 0.18)",
  muted: "#9aa4b2",
  panel: "rgba(10, 13, 19, 0.84)",
  panelStrong: "rgba(16, 22, 29, 0.96)",
  text: "#f5f7fb",
} as const;

const introDuration = 96;
const payloadDuration = 126;
const networkDuration = 132;
const splitDuration = 120;
const outroDuration = 126;
const transitionDuration = 15;

export const bossRaidMercenaryDuration =
  introDuration +
  payloadDuration +
  networkDuration +
  splitDuration +
  outroDuration -
  transitionDuration * 4;

const payloadLines = [
  "POST /v1/raid",
  "{",
  '  "agent": "mercenary-v1",',
  '  "taskType": "code",',
  '  "task": "Ship the task, not a demo.",',
  '  "output": {"mode": "patch"},',
  '  "raidPolicy": {"maxAgents": 4, "maxTotalCost": 16, "privacyMode": "prefer"}',
  "}",
] as const;

const providers = [
  { x: 260, y: 248, label: "solver-alpha", accent: colors.cyan, readyAt: 10, approvedAt: 82, approved: true },
  { x: 1360, y: 206, label: "solver-kappa", accent: colors.green, readyAt: 18, approvedAt: 96, approved: true },
  { x: 1440, y: 670, label: "solver-echo", accent: colors.accent, readyAt: 26, approvedAt: 104, approved: true },
  { x: 250, y: 700, label: "solver-delta", accent: "#b1a7ff", readyAt: 32, approvedAt: 0, approved: false },
] as const;

const approvedProviders = providers.filter((provider) => provider.approved);

const metricStyle: CSSProperties = {
  border: `1px solid ${colors.lineStrong}`,
  borderRadius: 999,
  display: "grid",
  gap: 6,
  minWidth: 132,
  padding: "14px 18px",
  background: "rgba(255, 255, 255, 0.02)",
  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.22)",
};

const cardBase: CSSProperties = {
  background: colors.panel,
  border: `1px solid ${colors.line}`,
  borderRadius: 24,
  boxShadow: "0 26px 64px rgba(0, 0, 0, 0.35)",
};

const transitionTiming = linearTiming({ durationInFrames: transitionDuration });
const outroTiming = springTiming({ durationInFrames: 18, config: { damping: 200 } });

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const typewriterText = (text: string, frame: number, start: number, charsPerFrame: number) => {
  const visible = Math.floor((frame - start) * charsPerFrame);
  return text.slice(0, clamp(visible, 0, text.length));
};

const BackgroundFrame = ({ children }: PropsWithChildren) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const orbit = interpolate(frame, [0, bossRaidMercenaryDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        backgroundImage: `radial-gradient(circle at ${28 + orbit * 18}% 16%, rgba(95, 219, 255, 0.14), transparent 26%), radial-gradient(circle at 74% ${18 + orbit * 16}%, rgba(245, 138, 58, 0.16), transparent 30%), linear-gradient(180deg, ${colors.bgAlt}, ${colors.bg})`,
        color: colors.text,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          opacity: 0.36,
          backgroundImage:
            "linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(180deg, rgba(0, 0, 0, 0.84), transparent 92%)",
        }}
      />
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          opacity: 0.34,
          backgroundImage:
            "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.055) 50%, transparent 100%)",
          backgroundSize: `100% ${height / 8}px`,
          mixBlendMode: "screen",
        }}
      />
      <svg
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, opacity: 0.12 }}
        aria-hidden="true"
      >
        {Array.from({ length: 18 }).map((_, index) => {
          const x = 120 + index * 100;
          const drift = Math.sin((frame + index * 14) / 22) * 14;

          return (
            <line
              key={index}
              x1={x + drift}
              y1={0}
              x2={x - drift}
              y2={height}
              stroke={index % 3 === 0 ? colors.accent : colors.cyan}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      {children}
    </AbsoluteFill>
  );
};

const FrameShell = ({ children }: PropsWithChildren) => {
  return (
    <AbsoluteFill style={{ padding: "72px 84px 60px", gap: 28 }}>
      <HeaderRow />
      {children}
      <FooterRule />
    </AbsoluteFill>
  );
};

const HeaderRow = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: reveal,
        transform: `translateY(${interpolate(reveal, [0, 1], [20, 0])}px)`,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div
          style={{
            fontFamily: monoFont,
            textTransform: "uppercase",
            letterSpacing: "0.34em",
            fontSize: 18,
            color: colors.accent,
          }}
        >
          Boss Raid
        </div>
        <div style={{ fontFamily: monoFont, color: colors.muted, fontSize: 20 }}>mercenary-v1 / public surface</div>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <MetricPill label="core" value="online" />
        <MetricPill label="route" value="/v1/raid" />
        <MetricPill label="providers" value="04 ready" />
      </div>
    </div>
  );
};

const MetricPill = ({ label, value }: { label: string; value: string }) => {
  return (
    <div style={metricStyle}>
      <span style={{ fontFamily: monoFont, fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: colors.muted }}>
        {label}
      </span>
      <strong style={{ fontFamily: displayFont, fontSize: 24, fontWeight: 600 }}>{value}</strong>
    </div>
  );
};

const FooterRule = () => {
  return (
    <div
      style={{
        marginTop: "auto",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 22,
        borderTop: `1px solid ${colors.line}`,
        color: colors.muted,
        fontFamily: monoFont,
        fontSize: 18,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}
    >
      <span>Boss Raid is the platform</span>
      <span>Mercenary is the orchestrator</span>
    </div>
  );
};

const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });
  const headlineLift = interpolate(frame, [0, 28], [26, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <FrameShell>
      <div style={{ display: "grid", gridTemplateColumns: "1.02fr 0.98fr", gap: 36, flex: 1, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24 }}>
          <div style={{ display: "grid", gap: 16 }}>
            <SectionLabel text="orchestrated execution" />
            <div
              style={{
                fontFamily: displayFont,
                fontSize: 108,
                fontWeight: 700,
                lineHeight: 0.92,
                letterSpacing: "-0.07em",
                transform: `translateY(${headlineLift}px)`,
                opacity: reveal,
              }}
            >
              <div>Hard task?</div>
              <div>
                <span style={{ color: colors.accent }}>Mercenary</span> runs the raid.
              </div>
              <div style={{ color: "#d0d7e4" }}>Approved raiders split payout.</div>
            </div>
            <p
              style={{
                maxWidth: 720,
                color: colors.muted,
                fontSize: 32,
                lineHeight: 1.42,
                opacity: interpolate(frame, [10, 34], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              Native raid routing, live provider readiness, real HTTP workers, and payout logic that rewards only successful providers.
            </p>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <ActionChip text="hire mercenary" accent={colors.accent} />
            <ActionChip text="join raid" accent={colors.cyan} />
          </div>
        </div>

        <HeroSlices frame={frame} />
      </div>
    </FrameShell>
  );
};

const HeroSlices = ({ frame }: { frame: number }) => {
  return (
    <div
      style={{
        ...cardBase,
        position: "relative",
        overflow: "hidden",
        background: "rgba(255,255,255,0.03)",
        minHeight: 760,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(8, 11, 18, 0.1) 0%, rgba(8, 11, 18, 0.54) 78%, rgba(8, 11, 18, 0.9) 100%)",
          zIndex: 2,
        }}
      />
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, padding: 22 }}>
        {[0, 1, 2, 3].map((index) => {
          const sliceSpring = spring({
            frame: frame - index * 6,
            fps: 30,
            config: index % 2 === 0 ? { damping: 200 } : { damping: 18, stiffness: 160 },
          });
          const y = interpolate(sliceSpring, [0, 1], [220 + index * 20, 0]);
          const scale = interpolate(sliceSpring, [0, 1], [1.25, 1.02]);
          const shift = interpolate(frame, [0, introDuration], [index * -46, index * 22], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={index}
              style={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 18,
                transform: `translateY(${y}px)`,
                border: `1px solid ${colors.line}`,
              }}
            >
              <Img
                src={heroImage}
                style={{
                  width: 1280,
                  height: "100%",
                  objectFit: "cover",
                  transform: `translateX(${shift}px) scale(${scale})`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 34, top: 34, zIndex: 3, display: "grid", gap: 10 }}>
        <div style={{ fontFamily: monoFont, fontSize: 18, letterSpacing: "0.22em", textTransform: "uppercase", color: colors.accent }}>
          raid-native public surface
        </div>
        <div style={{ fontFamily: displayFont, fontSize: 40, fontWeight: 600, letterSpacing: "-0.05em" }}>
          Boss Raid platform<br />Mercenary orchestration
        </div>
      </div>
    </div>
  );
};

const PayloadScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panelReveal = spring({ frame, fps, config: { damping: 200 } });

  return (
    <FrameShell>
      <div style={{ display: "grid", gridTemplateColumns: "0.92fr 1.08fr", gap: 32, flex: 1 }}>
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          <SectionLabel text="native raid route" />
          <div style={{ fontFamily: displayFont, fontSize: 90, lineHeight: 0.94, letterSpacing: "-0.07em", fontWeight: 700 }}>
            {`POST /v1/raid`} is the public action path.
          </div>
          <p style={{ fontSize: 32, lineHeight: 1.42, color: colors.muted, maxWidth: 560 }}>
            Mercenary accepts the task, probes live providers, routes the run, evaluates output, and settles only successful work.
          </p>
          <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
            <SideStat text="native request model" accent={colors.accent} />
            <SideStat text="OpenAI-compatible chat wrapper" accent={colors.cyan} />
            <SideStat text="real HTTP providers only" accent={colors.green} />
          </div>
        </div>

        <div
          style={{
            ...cardBase,
            padding: "28px 30px",
            opacity: panelReveal,
            transform: `translateY(${interpolate(panelReveal, [0, 1], [28, 0])}px)`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontFamily: monoFont, fontSize: 18, letterSpacing: "0.22em", textTransform: "uppercase", color: colors.muted }}>
                request console
              </div>
              <div style={{ fontFamily: displayFont, fontSize: 34, fontWeight: 600 }}>/v1/raid</div>
            </div>
            <div
              style={{
                fontFamily: monoFont,
                fontSize: 18,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: colors.green,
                padding: "12px 16px",
                borderRadius: 999,
                border: `1px solid ${colors.greenSoft}`,
                background: "rgba(88, 243, 162, 0.06)",
              }}
            >
              ready
            </div>
          </div>
          <div
            style={{
              borderRadius: 20,
              border: `1px solid ${colors.lineStrong}`,
              background: "rgba(6, 8, 13, 0.94)",
              padding: "22px 24px",
              minHeight: 620,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.02))" }} />
            <div style={{ display: "grid", gap: 18, position: "relative", zIndex: 1 }}>
              {payloadLines.map((line, index) => {
                const start = 8 + index * 9;
                const visible = typewriterText(line, frame, start, 3.6);
                const active = frame >= start && frame < start + line.length / 3.6 + 8;

                return (
                  <div key={line} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                    <span style={{ color: colors.lineStrong, fontFamily: monoFont, fontSize: 18 }}>{String(index + 1).padStart(2, "0")}</span>
                    <span
                      style={{
                        fontFamily: monoFont,
                        fontSize: 26,
                        whiteSpace: "pre",
                        color: index === 0 ? colors.accent : colors.text,
                      }}
                    >
                      {visible}
                      {active ? <span style={{ color: colors.cyan }}>|</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 32,
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              {[
                ["agent", "mercenary-v1"],
                ["max agents", "4"],
                ["privacy mode", "prefer"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    borderRadius: 18,
                    border: `1px solid ${colors.line}`,
                    padding: "16px 18px",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontFamily: monoFont, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600, marginTop: 10 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FrameShell>
  );
};

const NetworkScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hubReveal = spring({ frame, fps, config: { damping: 200 } });

  return (
    <FrameShell>
      <SectionLabel text="provider routing" />
      <div style={{ fontFamily: displayFont, fontSize: 92, lineHeight: 0.94, letterSpacing: "-0.07em", fontWeight: 700, maxWidth: 960 }}>
        Mercenary probes, routes, and approves live providers.
      </div>
      <div style={{ position: "relative", flex: 1, marginTop: 18 }}>
        <svg width="100%" height="100%" viewBox="0 0 1752 700" style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden="true">
          {providers.map((provider) => {
            const readyProgress = spring({
              frame: frame - provider.readyAt,
              fps,
              config: { damping: 200 },
            });
            const strokeOpacity = interpolate(readyProgress, [0, 1], [0.14, provider.approved ? 0.9 : 0.42]);

            return (
              <g key={provider.label}>
                <line
                  x1={876}
                  y1={312}
                  x2={provider.x + 120}
                  y2={provider.y + 62}
                  stroke={provider.accent}
                  strokeWidth={3}
                  strokeOpacity={strokeOpacity}
                  strokeDasharray="18 16"
                  strokeDashoffset={-frame * 3}
                />
                <circle cx={provider.x + 120} cy={provider.y + 62} r={8} fill={provider.accent} opacity={strokeOpacity} />
              </g>
            );
          })}
        </svg>

        <div
          style={{
            ...cardBase,
            position: "absolute",
            left: 650,
            top: 180,
            width: 460,
            padding: "28px 30px",
            borderColor: colors.accentSoft,
            background: colors.panelStrong,
            opacity: hubReveal,
            transform: `scale(${interpolate(hubReveal, [0, 1], [0.92, 1])})`,
          }}
        >
          <div style={{ fontFamily: monoFont, fontSize: 18, letterSpacing: "0.2em", textTransform: "uppercase", color: colors.accent }}>
            orchestration hub
          </div>
          <div style={{ marginTop: 12, fontFamily: displayFont, fontSize: 48, fontWeight: 700, letterSpacing: "-0.05em" }}>Mercenary</div>
          <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
            <HubRow label="route" value="POST /v1/raid" />
            <HubRow label="selection" value="readiness + rank" />
            <HubRow label="concurrency" value="maxConcurrency honored" />
            <HubRow label="state" value="HTTP workers only" />
          </div>
        </div>

        {providers.map((provider) => {
          const appear = spring({
            frame: frame - provider.readyAt,
            fps,
            config: { damping: 200 },
          });
          const localFrame = frame - provider.readyAt;
          const status =
            !provider.approved && localFrame > 52
              ? "standby"
              : provider.approved && frame >= provider.approvedAt
                ? "approved"
                : localFrame > 28
                  ? "running"
                  : "probing";

          return (
            <div
              key={provider.label}
              style={{
                ...cardBase,
                position: "absolute",
                left: provider.x,
                top: provider.y,
                width: 280,
                padding: "22px 24px",
                borderColor: `${provider.accent}66`,
                opacity: appear,
                transform: `translateY(${interpolate(appear, [0, 1], [26, 0])}px)`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontFamily: monoFont, fontSize: 16, letterSpacing: "0.18em", textTransform: "uppercase", color: provider.accent }}>
                    provider
                  </div>
                  <div style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600 }}>{provider.label}</div>
                </div>
                <StatusBadge status={status} accent={provider.accent} />
              </div>
              <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                <ProviderLine label="protocol" value="http" />
                <ProviderLine label="readiness" value={localFrame > 20 ? "green" : "probing"} />
                <ProviderLine label="result" value={provider.approved ? "eligible" : "waiting"} />
              </div>
              <div
                style={{
                  marginTop: 16,
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${interpolate(localFrame, [0, 72], [0, provider.approved ? 100 : 64], {
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    })}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${provider.accent}, rgba(255,255,255,0.9))`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </FrameShell>
  );
};

const SplitScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = 36;
  const perProvider = total / approvedProviders.length;

  return (
    <FrameShell>
      <div style={{ display: "grid", gridTemplateColumns: "0.94fr 1.06fr", gap: 34, flex: 1 }}>
        <div style={{ display: "grid", alignContent: "start", gap: 18 }}>
          <SectionLabel text="settlement" />
          <div style={{ fontFamily: displayFont, fontSize: 92, lineHeight: 0.94, letterSpacing: "-0.07em", fontWeight: 700 }}>
            Successful providers split payout equally.
          </div>
          <p style={{ fontSize: 32, lineHeight: 1.42, color: colors.muted, maxWidth: 620 }}>
            Mercenary settles the approved set only. When three providers land valid work, the payout divides into three equal shares.
          </p>
          <div
            style={{
              ...cardBase,
              padding: "24px 28px",
              marginTop: 12,
              display: "grid",
              gap: 16,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <HubRow label="approved providers" value={String(approvedProviders.length)} />
            <HubRow label="raid budget" value={`$${total.toFixed(2)}`} />
            <HubRow label="payout each" value={`$${perProvider.toFixed(2)}`} />
          </div>
        </div>

        <div
          style={{
            ...cardBase,
            padding: "28px 30px",
            position: "relative",
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(95,219,255,0.06) 0%, rgba(10,13,19,0.92) 36%, rgba(10,13,19,1) 100%)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, height: "100%" }}>
            {approvedProviders.map((provider, index) => {
              const rise = spring({
                frame: frame - index * 8,
                fps,
                config: { damping: 200 },
              });
              const barHeight = interpolate(rise, [0, 1], [80, 420]);
              const valueOpacity = interpolate(rise, [0, 1], [0, 1]);

              return (
                <div key={provider.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 18 }}>
                  <div
                    style={{
                      opacity: valueOpacity,
                      fontFamily: displayFont,
                      fontSize: 42,
                      fontWeight: 700,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    ${perProvider.toFixed(0)}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      height: 460,
                      borderRadius: 26,
                      border: `1px solid ${colors.lineStrong}`,
                      background: "rgba(255,255,255,0.03)",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: barHeight,
                        borderRadius: 18,
                        background: `linear-gradient(180deg, ${provider.accent}, rgba(255,255,255,0.92))`,
                        boxShadow: `0 18px 36px ${provider.accent}40`,
                      }}
                    />
                  </div>
                  <div style={{ textAlign: "center", display: "grid", gap: 8 }}>
                    <div style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600 }}>{provider.label}</div>
                    <div style={{ fontFamily: monoFont, fontSize: 16, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>
                      approved
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </FrameShell>
  );
};

const OutroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200 } });

  return (
    <FrameShell>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, flex: 1, alignItems: "stretch" }}>
        <div style={{ display: "grid", alignContent: "start", gap: 18 }}>
          <SectionLabel text="close" />
          <div
            style={{
              fontFamily: displayFont,
              fontSize: 98,
              lineHeight: 0.93,
              letterSpacing: "-0.08em",
              fontWeight: 700,
              opacity: reveal,
              transform: `translateY(${interpolate(reveal, [0, 1], [18, 0])}px)`,
            }}
          >
            Boss Raid is the platform.
            <br />
            <span style={{ color: colors.accent }}>Mercenary</span> is the orchestrator.
          </div>
          <p style={{ fontSize: 32, lineHeight: 1.42, color: colors.muted, maxWidth: 620 }}>
            Start from the native raid route, expand into chat compatibility when needed, and keep the execution path real.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
            <ActionChip text="POST /v1/raid" accent={colors.accent} />
            <ActionChip text="OpenAI-compatible chat" accent={colors.cyan} />
            <ActionChip text="x402 ready" accent={colors.green} />
          </div>
        </div>

        <div
          style={{
            ...cardBase,
            overflow: "hidden",
            position: "relative",
            background:
              "linear-gradient(180deg, rgba(95,219,255,0.08) 0%, rgba(10,13,19,0.82) 32%, rgba(10,13,19,0.98) 100%)",
          }}
        >
          <AbsoluteFill style={{ padding: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, flex: 1 }}>
              {[0, 1, 2, 3].map((index) => {
                const translate = interpolate(frame, [0, outroDuration], [index * -36, index * 18], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });

                return (
                  <div key={index} style={{ overflow: "hidden", borderRadius: 18, border: `1px solid ${colors.line}` }}>
                    <Img
                      src={heroImage}
                      style={{
                        width: 1120,
                        height: "100%",
                        objectFit: "cover",
                        transform: `translateX(${translate}px) scale(1.08)`,
                        opacity: 0.92,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div
              style={{
                marginTop: "auto",
                ...cardBase,
                padding: "24px 26px",
                background: "rgba(8, 11, 18, 0.88)",
                borderColor: colors.lineStrong,
              }}
            >
              <div style={{ display: "grid", gap: 16 }}>
                <HubRow label="platform" value="Boss Raid" />
                <HubRow label="orchestrator" value="Mercenary" />
                <HubRow label="native route" value="POST /v1/raid" />
                <HubRow label="worker model" value="real HTTP providers" />
              </div>
            </div>
          </AbsoluteFill>
        </div>
      </div>
    </FrameShell>
  );
};

const HubRow = ({ label, value }: { label: string; value: string }) => {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
      <span style={{ fontFamily: monoFont, fontSize: 18, letterSpacing: "0.16em", textTransform: "uppercase", color: colors.muted }}>
        {label}
      </span>
      <strong style={{ fontFamily: displayFont, fontSize: 28, fontWeight: 600, textAlign: "right" }}>{value}</strong>
    </div>
  );
};

const ProviderLine = ({ label, value }: { label: string; value: string }) => {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <span style={{ fontFamily: monoFont, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: colors.muted }}>
        {label}
      </span>
      <span style={{ fontFamily: displayFont, fontSize: 21, fontWeight: 600 }}>{value}</span>
    </div>
  );
};

const StatusBadge = ({ status, accent }: { status: string; accent: string }) => {
  const background =
    status === "approved" ? `${colors.greenSoft}` : status === "running" ? `${colors.cyanSoft}` : "rgba(255,255,255,0.05)";
  const color = status === "approved" ? colors.green : status === "running" ? colors.cyan : accent;

  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        border: `1px solid ${color}55`,
        background,
        fontFamily: monoFont,
        fontSize: 14,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color,
      }}
    >
      {status}
    </div>
  );
};

const SectionLabel = ({ text }: { text: string }) => {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 64, height: 2, background: `linear-gradient(90deg, ${colors.accent}, transparent)` }} />
      <div style={{ fontFamily: monoFont, fontSize: 18, letterSpacing: "0.22em", textTransform: "uppercase", color: colors.accent }}>
        {text}
      </div>
    </div>
  );
};

const SideStat = ({ text, accent }: { text: string; accent: string }) => {
  return (
    <div
      style={{
        ...cardBase,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "18px 20px",
        borderColor: `${accent}44`,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 999, background: accent, boxShadow: `0 0 24px ${accent}` }} />
      <div style={{ fontFamily: monoFont, fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase" }}>{text}</div>
    </div>
  );
};

const ActionChip = ({ text, accent }: { text: string; accent: string }) => {
  return (
    <div
      style={{
        borderRadius: 999,
        border: `1px solid ${accent}66`,
        padding: "16px 22px",
        fontFamily: monoFont,
        fontSize: 18,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: colors.text,
        background: `linear-gradient(180deg, ${accent}22, rgba(255,255,255,0.02))`,
        boxShadow: `0 18px 40px ${accent}18`,
      }}
    >
      {text}
    </div>
  );
};

export const BossRaidMercenaryVideo = () => {
  return (
    <BackgroundFrame>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={introDuration}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={transitionTiming} />
        <TransitionSeries.Sequence durationInFrames={payloadDuration}>
          <PayloadScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={transitionTiming} />
        <TransitionSeries.Sequence durationInFrames={networkDuration}>
          <NetworkScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={transitionTiming} />
        <TransitionSeries.Sequence durationInFrames={splitDuration}>
          <SplitScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={outroTiming} />
        <TransitionSeries.Sequence durationInFrames={outroDuration}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </BackgroundFrame>
  );
};

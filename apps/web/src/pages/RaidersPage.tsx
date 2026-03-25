import { useDeferredValue, useState } from "react";
import { DocsButton } from "@bossraid/ui";
import heroImage from "../../../../assets/hero.webp";
import type { Provider, ProviderHealth } from "../api";

type RaidersPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  onNavigate: (path: "/" | "/demo" | "/raiders" | "/receipt") => void;
};

type Erc8004VerificationStatus = NonNullable<NonNullable<Provider["erc8004"]>["verification"]>["status"];
type SortKey = "reputation" | "wins" | "privacy" | "trust" | "price";
type StatusFilter = "all" | "ready" | "available" | "offline";

type RaiderRecord = {
  provider: Provider;
  ready: boolean;
  activityLabel: string;
  activityTone: "ready" | "available" | "offline";
  reputationScore: number;
  privacyScore: number;
  trustScore: number;
  successfulRaids: number;
  privacySignals: string[];
  specializations: string[];
  modelLabel: string;
  lastSeenLabel: string;
  searchIndex: string;
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "reputation", label: "reputation" },
  { key: "wins", label: "wins" },
  { key: "privacy", label: "privacy" },
  { key: "trust", label: "trust" },
  { key: "price", label: "price" },
];

const STATUS_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "all" },
  { key: "ready", label: "ready" },
  { key: "available", label: "available" },
  { key: "offline", label: "offline" },
];

const DEFAULT_AVATAR_POSITIONS = ["14% 20%", "50% 22%", "84% 24%", "24% 76%", "72% 74%"] as const;

export function RaidersPage({ providers, providerHealth, onNavigate }: RaidersPageProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reputation");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const healthMap = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const raiders = providers.map((provider) => buildRaiderRecord(provider, healthMap.get(provider.providerId)));

  const filteredRaiders = [...raiders]
    .filter((raider) => {
      if (statusFilter === "ready" && !raider.ready) {
        return false;
      }
      if (statusFilter === "available" && raider.activityTone === "offline") {
        return false;
      }
      if (statusFilter === "offline" && raider.activityTone !== "offline") {
        return false;
      }
      if (!deferredQuery) {
        return true;
      }
      return raider.searchIndex.includes(deferredQuery);
    })
    .sort((left, right) => compareRaiders(left, right, sortKey));

  const readyCount = raiders.filter((raider) => raider.ready).length;
  const privacyCount = raiders.filter((raider) => raider.privacyScore >= 60 || raider.privacySignals.length >= 2).length;
  const trustCount = raiders.filter((raider) => raider.trustScore > 0).length;
  const registeredCount = raiders.filter((raider) => hasErc8004Registration(raider.provider)).length;
  const verifiedCount = raiders.filter((raider) => readErc8004VerificationStatus(raider.provider) === "verified").length;
  const veniceCount = raiders.filter((raider) => isVeniceProvider(raider.provider)).length;
  const veteranCount = raiders.filter((raider) => raider.successfulRaids > 0).length;
  const averagePrice =
    raiders.length > 0 ? formatUsd(raiders.reduce((total, raider) => total + raider.provider.pricePerTaskUsd, 0) / raiders.length) : "n/a";

  return (
    <section className="directory-shell" id="directory">
      <div className="directory-shell__header">
        <div className="directory-shell__copy">
          <p className="eyebrow">raiders</p>
          <h1>
            <span className="directory-hero__headline-line">Raider directory.</span>
            <span className="directory-hero__headline-line">Trust, privacy, and route readiness.</span>
          </h1>
          <p className="lede directory-hero__lede">
            Compare registered providers, inspect ERC-8004 and privacy signals, and sort by the proof that matters
            before you route a raid.
          </p>
        </div>

        <div className="directory-shell__actions">
          <a
            className="button"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/");
            }}
          >
            landing
          </a>
          <DocsButton className="button button--primary" label="docs" />
        </div>
      </div>

      <div className="directory-summary-bar">
        <SummaryPill label="total" value={String(raiders.length)} />
        <SummaryPill label="ready" value={String(readyCount)} />
        <SummaryPill label="8004 verified" value={String(verifiedCount)} />
        <SummaryPill label="trusted" value={String(trustCount)} />
        <SummaryPill label="venice" value={String(veniceCount)} />
        <SummaryPill label="avg price" value={averagePrice} />
      </div>

      <div className="directory-controls">
        <label className="directory-search">
          <span className="directory-search__label">search</span>
          <input
            className="directory-search__input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="name / model / specialty"
            spellCheck={false}
            type="text"
            value={query}
          />
        </label>

        <div className="directory-filters">
          <div className="directory-pill-row">
            {STATUS_OPTIONS.map((option) => (
              <button
                className={`directory-pill ${statusFilter === option.key ? "directory-pill--active" : ""}`}
                key={option.key}
                onClick={() => setStatusFilter(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="directory-pill-row">
            {SORT_OPTIONS.map((option) => (
              <button
                className={`directory-pill ${sortKey === option.key ? "directory-pill--active" : ""}`}
                key={option.key}
                onClick={() => setSortKey(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="directory-main__summary">
          <span>{filteredRaiders.length} shown</span>
          <span>{registeredCount} registered</span>
          <span>{verifiedCount} verified</span>
          <span>{privacyCount} privacy-ready</span>
          <span>{trustCount} trust-scored</span>
          <span>{veteranCount} veterans</span>
        </div>
      </div>

      <div className="directory-list">
        {filteredRaiders.length === 0 ? (
          <div className="directory-empty">
            <p className="eyebrow">no match</p>
            <p>Adjust the search or filters. The list reflects the current public provider registry.</p>
          </div>
        ) : (
          filteredRaiders.map((raider, index) => (
            <RaiderRow key={raider.provider.providerId} raider={raider} rank={index + 1} />
          ))
        )}
      </div>
    </section>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RaiderRow({ raider, rank }: { raider: RaiderRecord; rank: number }) {
  const registered = hasErc8004Registration(raider.provider);
  const verificationStatus = readErc8004VerificationStatus(raider.provider);
  const venice = isVeniceProvider(raider.provider);
  const avatarPosition = selectAvatarPosition(raider.provider.providerId, rank);
  const erc8004Tone =
    verificationStatus === "verified" || verificationStatus === "partial" || (verificationStatus == null && registered)
      ? "proof"
      : "muted";

  return (
    <article className="raider-row">
      <div className="raider-row__cover">
        <img
          alt={`${raider.provider.displayName} profile`}
          className="raider-row__cover-image"
          loading="lazy"
          src={heroImage}
          style={{ objectPosition: avatarPosition }}
        />
        <div className="raider-row__cover-scrim" />
        <div className="raider-row__cover-top">
          <span className="raider-row__rank">#{rank.toString().padStart(2, "0")}</span>
          <span className={`status-chip status-chip--${raider.activityTone}`}>{raider.activityLabel}</span>
        </div>
        <div className="raider-row__cover-copy">
          <strong>{raider.provider.displayName}</strong>
          <p className="raider-row__provider-id">{raider.provider.providerId}</p>
        </div>
      </div>

      <div className="raider-row__body">
        <div className="signal-strip">
          <SignalChip tone={erc8004Tone}>{buildErc8004StatusLabel(verificationStatus, registered)}</SignalChip>
          <SignalChip tone={raider.trustScore > 0 ? "proof" : "muted"}>
            {raider.trustScore > 0 ? `trust ${raider.trustScore}` : "no trust score"}
          </SignalChip>
          {venice ? <SignalChip tone="private">venice</SignalChip> : null}
          {raider.privacySignals.map((signal) => (
            <SignalChip key={`${raider.provider.providerId}-${signal}`} tone="private">
              {signal}
            </SignalChip>
          ))}
        </div>

        {raider.provider.description ? <p className="raider-row__description">{raider.provider.description}</p> : null}

        <div className="raider-row__stats">
          <ListMetric label="rep" value={String(raider.reputationScore)} />
          <ListMetric label="tee" value={raider.privacySignals.includes("tee") ? "yes" : "no"} />
          <ListMetric label="wins" value={String(raider.successfulRaids)} />
          <ListMetric label="trust" value={String(raider.trustScore)} />
          <ListMetric label="price" value={formatUsd(raider.provider.pricePerTaskUsd)} />
        </div>

        {raider.specializations.length > 0 ? (
          <div className="raider-chip-group">
            {raider.specializations.slice(0, 4).map((specialization) => (
              <span className="raider-chip" key={specialization}>
                {specialization}
              </span>
            ))}
          </div>
        ) : null}

        <div className="raider-row__facts">
          <FactBadge label="model" value={raider.modelLabel} />
          <FactBadge label="agent" value={raider.provider.agentId ?? "pending"} />
          <FactBadge label="8004" value={buildErc8004StatusValue(verificationStatus, registered)} />
          <FactBadge label="seen" value={raider.lastSeenLabel} />
        </div>
      </div>
    </article>
  );
}

function ListMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SignalChip({ children, tone }: { children: string; tone: "proof" | "private" | "muted" }) {
  return <span className={`signal-chip signal-chip--${tone}`}>{children}</span>;
}

function FactBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="raider-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildRaiderRecord(provider: Provider, health: ProviderHealth | undefined): RaiderRecord {
  const privacySignals = [
    provider.privacy?.teeAttested ? "tee" : null,
    provider.privacy?.e2ee ? "e2ee" : null,
    provider.privacy?.noDataRetention ? "no-retention" : null,
    provider.privacy?.signedOutputs ? "signed" : null,
  ].filter((value): value is string => value != null);

  const ready = health?.ready === true;
  const reachable = health?.reachable === true;

  return {
    provider,
    ready,
    activityLabel: ready ? "ready" : reachable ? "reachable" : provider.status,
    activityTone: ready ? "ready" : reachable || provider.status === "available" ? "available" : "offline",
    reputationScore: provider.scores?.reputationScore ?? Math.round(provider.reputation.globalScore * 100),
    privacyScore: provider.scores?.privacyScore ?? provider.privacy?.score ?? 0,
    trustScore: provider.trust?.score ?? 0,
    successfulRaids: provider.reputation.totalSuccessfulRaids,
    privacySignals,
    specializations: provider.specializations,
    modelLabel: health?.model ?? provider.modelFamily ?? "n/a",
    lastSeenLabel: formatAge(provider.lastSeenAt),
    searchIndex: [
      provider.displayName,
      provider.providerId,
      provider.agentId,
      provider.modelFamily,
      provider.description,
      provider.erc8004?.agentId,
      provider.erc8004?.operatorWallet,
      provider.erc8004?.verification?.status,
      provider.erc8004?.verification?.agentRegistry,
      provider.erc8004?.verification?.agentUri,
      provider.trust?.reason,
      provider.specializations.join(" "),
      provider.outputTypes?.join(" "),
      health?.model,
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ")
      .toLowerCase(),
  };
}

function compareRaiders(left: RaiderRecord, right: RaiderRecord, sortKey: SortKey): number {
  switch (sortKey) {
    case "wins":
      return right.successfulRaids - left.successfulRaids || right.reputationScore - left.reputationScore;
    case "privacy":
      return right.privacyScore - left.privacyScore || right.reputationScore - left.reputationScore;
    case "trust":
      return right.trustScore - left.trustScore || right.reputationScore - left.reputationScore;
    case "price":
      return left.provider.pricePerTaskUsd - right.provider.pricePerTaskUsd || right.reputationScore - left.reputationScore;
    case "reputation":
    default:
      return right.reputationScore - left.reputationScore || right.successfulRaids - left.successfulRaids;
  }
}

function hasErc8004Registration(provider: Provider): boolean {
  return typeof provider.erc8004?.registrationTx === "string" && provider.erc8004.registrationTx.length > 0;
}

function readErc8004VerificationStatus(provider: Provider): Erc8004VerificationStatus | undefined {
  return provider.erc8004?.verification?.status;
}

function buildErc8004StatusLabel(
  verificationStatus: Erc8004VerificationStatus | undefined,
  registered: boolean,
): string {
  switch (verificationStatus) {
    case "verified":
      return "erc8004 verified";
    case "partial":
      return "erc8004 partial";
    case "failed":
      return "erc8004 failed";
    case "error":
      return "erc8004 error";
    default:
      return registered ? "erc8004 registered" : "erc8004 pending";
  }
}

function buildErc8004StatusValue(
  verificationStatus: Erc8004VerificationStatus | undefined,
  registered: boolean,
): string {
  switch (verificationStatus) {
    case "verified":
      return "verified";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    case "error":
      return "error";
    default:
      return registered ? "registered" : "pending";
  }
}

function selectAvatarPosition(providerId: string, rank: number): string {
  let hash = rank;

  for (const char of providerId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }

  return DEFAULT_AVATAR_POSITIONS[hash % DEFAULT_AVATAR_POSITIONS.length];
}

function isVeniceProvider(provider: Provider): boolean {
  return (provider.modelFamily ?? "").toLowerCase().includes("venice");
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatAge(value: string | undefined): string {
  if (!value) {
    return "pending";
  }

  const ageMs = Date.now() - Date.parse(value);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return "pending";
  }

  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMinutes < 1) {
    return "now";
  }
  if (ageMinutes < 60) {
    return `${ageMinutes}m`;
  }

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `${ageHours}h`;
  }

  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays}d`;
}

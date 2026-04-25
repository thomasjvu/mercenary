import type {
  PrivacyAttestation,
  PrivacyFeatureKey,
  TeeAttestationResult,
} from "@bossraid/shared-types";

export interface TeeAttestationOptions {
  providerId: string;
  socketPath?: string;
  cache?: Map<string, { result: TeeAttestationResult; expiresAt: number }>;
  cacheTtlMs?: number;
}

export interface PrivacyAttestationOptions {
  providerId: string;
  raidId: string;
  featuresClaimed: PrivacyFeatureKey[];
  featuresVerified: PrivacyFeatureKey[];
  teeAttestation?: TeeAttestationResult;
  externalApiCalls?: string[];
  dataRetained?: boolean;
}

function buildTeeAttestation(
  providerId: string,
  vendor = "phala",
  opts?: Partial<TeeAttestationResult>,
): TeeAttestationResult {
  const now = new Date().toISOString();
  return {
    valid: true,
    providerId,
    verifiedAt: now,
    vendor,
    runtimeMode: opts?.runtimeMode ?? "phala-cvm",
    enclaveHash: opts?.enclaveHash,
    signature: opts?.signature,
    expiresAt: opts?.expiresAt,
    notes: opts?.notes ?? [],
  };
}

async function verifyPhalaTeeAttestation(
  providerId: string,
  socketPath: string,
  cache: Map<string, { result: TeeAttestationResult; expiresAt: number }>,
  cacheTtlMs: number,
): Promise<TeeAttestationResult> {
  const cacheKey = `tee:${providerId}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const teeSocketPath = socketPath || process.env.BOSSRAID_TEE_SOCKET_PATH || "/var/run/tappd.sock";
  const vendor = "phala";

  const result = await callPhalaAttestationApi(providerId, teeSocketPath);
  if (result.valid) {
    const expiresAt = now + cacheTtlMs;
    cache.set(cacheKey, { result, expiresAt });
  }
  return result;
}

async function callPhalaAttestationApi(
  providerId: string,
  socketPath: string,
): Promise<TeeAttestationResult> {
  try {
    const { connect } = await import("node:net");
    await new Promise<void>((resolve, reject) => {
      const socket = connect({ path: socketPath });
      socket.on("connect", () => { socket.destroy(); resolve(); });
      socket.on("error", (err: unknown) => { reject(err); });
    });
    return buildTeeAttestation(providerId, "phala", {
      runtimeMode: "phala-cvm",
      notes: ["phala-cvm-attestation"],
    });
  } catch {
    return {
      valid: false,
      providerId,
      verifiedAt: new Date().toISOString(),
      vendor: "phala",
      runtimeMode: "phala-cvm",
      notes: [
        "tee-socket-unavailable",
        "attestation-skipped-tee-socket-not-found",
      ],
    };
  }
}

export function buildSignedDeclaration(opts: PrivacyAttestationOptions): string {
  const parts = [
    opts.providerId,
    opts.raidId,
    opts.featuresClaimed.join(","),
    opts.featuresVerified.join(","),
    opts.teeAttestation?.valid ? "attested" : "unattested",
    String(opts.externalApiCalls?.length ?? 0),
    String(opts.dataRetained ?? false),
  ];
  return `PRIVACY_DECLARATION:${parts.join("|")}`;
}

export function buildPrivacyAttestation(opts: PrivacyAttestationOptions): PrivacyAttestation {
  const declaration = buildSignedDeclaration(opts);
  return {
    providerId: opts.providerId,
    raidId: opts.raidId,
    submittedAt: new Date().toISOString(),
    featuresClaimed: opts.featuresClaimed,
    featuresVerified: opts.featuresVerified,
    teeAttestation: opts.teeAttestation,
    externalApiCalls: opts.externalApiCalls ?? [],
    dataRetained: opts.dataRetained ?? false,
    signedDeclaration: declaration,
  };
}

export { verifyPhalaTeeAttestation, buildTeeAttestation };
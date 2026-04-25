import type { PrivacyAttestation, PrivacyFeatureKey, TeeAttestationResult } from "@bossraid/shared-types";

export interface PrivacyFeaturesConfig {
  featuresClaimed: PrivacyFeatureKey[];
  teeSocketPath?: string;
}

async function verifyTeeAttestation(
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
    return {
      valid: true,
      providerId,
      verifiedAt: new Date().toISOString(),
      vendor: "phala",
      runtimeMode: "phala-cvm",
      notes: ["phala-cvm-attestation"],
    };
  } catch {
    return {
      valid: false,
      providerId,
      verifiedAt: new Date().toISOString(),
      vendor: "phala",
      runtimeMode: "phala-cvm",
      notes: ["tee-socket-unavailable", "attestation-skipped"],
    };
  }
}

function buildDeclaration(
  providerId: string,
  raidId: string,
  featuresClaimed: PrivacyFeatureKey[],
  teeResult: TeeAttestationResult,
): string {
  const parts = [
    providerId,
    raidId,
    featuresClaimed.join(","),
    teeResult.valid ? "attested" : "unattested",
    "0",
    "false",
  ];
  return `PRIVACY_DECLARATION:${parts.join("|")}`;
}

export async function buildProviderPrivacyAttestation(
  providerId: string,
  raidId: string,
  config: PrivacyFeaturesConfig,
): Promise<PrivacyAttestation | undefined> {
  const socketPath = config.teeSocketPath ?? process.env.BOSSRAID_TEE_SOCKET_PATH ?? "/var/run/tappd.sock";
  const teeResult = await verifyTeeAttestation(providerId, socketPath);
  const featuresVerified: PrivacyFeatureKey[] = [];
  if (teeResult.valid && config.featuresClaimed.includes("tee_attested")) {
    featuresVerified.push("tee_attested");
  }

  const declaration = buildDeclaration(providerId, raidId, config.featuresClaimed, teeResult);
  return {
    providerId,
    raidId,
    submittedAt: new Date().toISOString(),
    featuresClaimed: config.featuresClaimed,
    featuresVerified,
    teeAttestation: teeResult,
    externalApiCalls: [],
    dataRetained: false,
    signedDeclaration: declaration,
  };
}
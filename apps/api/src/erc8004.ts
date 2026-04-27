import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  type Erc8004Identity,
  type Erc8004Verification,
  type ProviderProfile,
  readBooleanEnv as readBooleanEnvUtil,
} from "@bossraid/shared-types";

const ERC8004_VERIFICATION_CACHE_MS = 60_000;

const erc721IdentityAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "uri", type: "string" }],
  },
] as const;

type Erc8004ReadClient = Pick<PublicClient, "getBytecode" | "readContract" | "getTransactionReceipt">;

export function createErc8004Verifier(env: NodeJS.ProcessEnv): {
  enabled: boolean;
  verifyIdentity(identity: Erc8004Identity | undefined): Promise<Erc8004Identity | undefined>;
  verifyProvider(provider: ProviderProfile): Promise<ProviderProfile>;
  verifyProviders(providers: ProviderProfile[]): Promise<ProviderProfile[]>;
} {
  const enabled = readBooleanEnv(env.BOSSRAID_ERC8004_VERIFY);
  const rpcUrl = env.BOSSRAID_RPC_URL?.trim();
  const chainId = env.BOSSRAID_CHAIN_ID?.trim();
  const client = enabled && rpcUrl ? createPublicClient({ transport: http(rpcUrl) }) : undefined;

  async function verifyIdentity(identity: Erc8004Identity | undefined): Promise<Erc8004Identity | undefined> {
    if (!enabled || !identity) {
      return identity;
    }

    return {
      ...identity,
      verification: await verifyErc8004IdentityWithClient(identity, {
        client,
        chainId,
      }),
    };
  }

  async function verifyProvider(provider: ProviderProfile): Promise<ProviderProfile> {
    if (!enabled || !provider.erc8004) {
      return provider;
    }

    provider.erc8004 = {
      ...provider.erc8004,
      verification: await verifyErc8004IdentityWithClient(provider.erc8004, {
        client,
        chainId,
      }),
    };
    return provider;
  }

  return {
    enabled,
    verifyIdentity,
    verifyProvider,
    async verifyProviders(providers) {
      if (!enabled) {
        return providers;
      }

      await Promise.all(providers.map((provider) => verifyProvider(provider)));
      return providers;
    },
  };
}

export async function verifyErc8004IdentityWithClient(
  identity: Erc8004Identity,
  options: {
    client?: Erc8004ReadClient;
    chainId?: string;
    now?: number;
  },
): Promise<Erc8004Verification> {
  const now = options.now ?? Date.now();
  if (verificationIsFresh(identity.verification, options.chainId, now)) {
    return identity.verification!;
  }

  const checkedAt = new Date(now).toISOString();
  const notes: string[] = [];
  const verificationBase = {
    checkedAt,
    chainId: options.chainId,
    notes,
  } satisfies Pick<Erc8004Verification, "checkedAt" | "chainId" | "notes">;

  if (!options.client) {
    notes.push("RPC verification is enabled but BOSSRAID_RPC_URL is not configured.");
    return {
      ...verificationBase,
      status: "not_checked",
    };
  }

  const identityRegistry = normalizeAddress(identity.identityRegistry);
  if (!identityRegistry) {
    notes.push("Identity registry address is missing or invalid.");
    return {
      ...verificationBase,
      status: "failed",
    };
  }

  const agentId = parseAgentId(identity.agentId);
  if (agentId == null) {
    notes.push("agentId is not a numeric ERC-721 token id.");
    return {
      ...verificationBase,
      agentRegistry: buildAgentRegistry(options.chainId, identityRegistry),
      status: "failed",
    };
  }

  try {
    const identityRegistryReachable = await hasContractCode(options.client, identityRegistry);
    if (!identityRegistryReachable) {
      notes.push("Identity registry contract is not deployed at the configured address.");
      return {
        ...verificationBase,
        agentRegistry: buildAgentRegistry(options.chainId, identityRegistry),
        identityRegistryReachable,
        status: "failed",
      };
    }

    const owner = (await options.client.readContract({
      address: identityRegistry,
      abi: erc721IdentityAbi,
      functionName: "ownerOf",
      args: [agentId],
    })) as Address;

    let agentUri: string | undefined;
    try {
      agentUri = (await options.client.readContract({
        address: identityRegistry,
        abi: erc721IdentityAbi,
        functionName: "tokenURI",
        args: [agentId],
      })) as string;
    } catch {
      notes.push("Identity registry owner check passed, but tokenURI could not be read.");
    }

    const operatorWallet = normalizeAddress(identity.operatorWallet);
    const operatorMatchesOwner =
      identity.operatorWallet == null ? undefined : operatorWallet != null && operatorWallet === owner;
    if (identity.operatorWallet && operatorWallet == null) {
      notes.push("Configured operator wallet is not a valid EVM address.");
    }
    if (operatorMatchesOwner === false) {
      notes.push("Configured operator wallet does not match the onchain owner of the ERC-8004 identity token.");
    }

    const registrationTxFound = await readRegistrationTxStatus(options.client, identity.registrationTx, notes);
    const reputationRegistryReachable = await readOptionalContractStatus(
      options.client,
      identity.reputationRegistry,
      "reputation registry",
      notes,
    );
    const validationRegistryReachable = await readOptionalContractStatus(
      options.client,
      identity.validationRegistry,
      "validation registry",
      notes,
    );

    return {
      ...verificationBase,
      status: buildVerificationStatus({
        operatorMatchesOwner,
        registrationTxFound,
        agentUri,
        reputationRegistryReachable,
        validationRegistryReachable,
      }),
      agentRegistry: buildAgentRegistry(options.chainId, identityRegistry),
      owner,
      agentUri,
      registrationTxFound,
      operatorMatchesOwner,
      identityRegistryReachable,
      reputationRegistryReachable,
      validationRegistryReachable,
      notes: notes.length > 0 ? notes : undefined,
    };
  } catch (error) {
    notes.push(error instanceof Error ? error.message : String(error));
    return {
      ...verificationBase,
      agentRegistry: buildAgentRegistry(options.chainId, identityRegistry),
      status: "error",
    };
  }
}

function verificationIsFresh(
  verification: Erc8004Verification | undefined,
  chainId: string | undefined,
  now: number,
): boolean {
  if (!verification?.checkedAt) {
    return false;
  }
  if (chainId && verification.chainId && verification.chainId !== chainId) {
    return false;
  }
  return now - Date.parse(verification.checkedAt) < ERC8004_VERIFICATION_CACHE_MS;
}

function buildAgentRegistry(chainId: string | undefined, identityRegistry: Address): string | undefined {
  if (!chainId) {
    return undefined;
  }
  return `eip155:${chainId}:${identityRegistry}`;
}

function parseAgentId(value: string): bigint | undefined {
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function normalizeAddress(value: string | undefined): Address | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

async function hasContractCode(client: Erc8004ReadClient, address: Address): Promise<boolean> {
  const bytecode = await client.getBytecode({ address });
  return typeof bytecode === "string" && bytecode !== "0x";
}

async function readOptionalContractStatus(
  client: Erc8004ReadClient,
  value: string | undefined,
  label: string,
  notes: string[],
): Promise<boolean | undefined> {
  if (!value) {
    return undefined;
  }

  const address = normalizeAddress(value);
  if (!address) {
    notes.push(`Configured ${label} address is invalid.`);
    return false;
  }

  const reachable = await hasContractCode(client, address);
  if (!reachable) {
    notes.push(`Configured ${label} contract is not deployed at the configured address.`);
  }
  return reachable;
}

async function readRegistrationTxStatus(
  client: Erc8004ReadClient,
  registrationTx: string | undefined,
  notes: string[],
): Promise<boolean | undefined> {
  if (!registrationTx) {
    return undefined;
  }

  const hash = normalizeHash(registrationTx);
  if (!hash) {
    notes.push("Configured registration transaction hash is not a valid hex value.");
    return false;
  }

  try {
    await client.getTransactionReceipt({ hash });
    return true;
  } catch {
    notes.push("Configured registration transaction could not be found on the configured chain.");
    return false;
  }
}

function normalizeHash(value: string): Hex | undefined {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) {
    return undefined;
  }
  return value as Hex;
}

function buildVerificationStatus(input: {
  operatorMatchesOwner?: boolean;
  registrationTxFound?: boolean;
  agentUri?: string;
  reputationRegistryReachable?: boolean;
  validationRegistryReachable?: boolean;
}): Erc8004Verification["status"] {
  if (input.operatorMatchesOwner === false || input.registrationTxFound === false) {
    return "failed";
  }

  const optionalChecks = [
    input.agentUri != null,
    input.reputationRegistryReachable,
    input.validationRegistryReachable,
  ].filter((value) => value !== undefined);

  return optionalChecks.every(Boolean) ? "verified" : "partial";
}

function readBooleanEnv(value: string | undefined): boolean {
  return readBooleanEnvUtil(value);
}

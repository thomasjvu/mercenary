import { stat } from 'node:fs/promises';
import { mnemonicToAccount } from 'viem/accounts';
import { type Erc8004Identity } from '@bossraid/shared-types';

export function readMercenaryErc8004Identity(env: NodeJS.ProcessEnv): Erc8004Identity | undefined {
  const agentId = env.BOSSRAID_ERC8004_AGENT_ID?.trim();
  if (!agentId) {
    return undefined;
  }

  const validationTxs = env.BOSSRAID_ERC8004_VALIDATION_TXS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    agentId,
    operatorWallet: env.BOSSRAID_ERC8004_OPERATOR_WALLET?.trim() || undefined,
    registrationTx: env.BOSSRAID_ERC8004_REGISTRATION_TX?.trim() || undefined,
    identityRegistry: env.BOSSRAID_ERC8004_IDENTITY_REGISTRY?.trim() || undefined,
    reputationRegistry: env.BOSSRAID_ERC8004_REPUTATION_REGISTRY?.trim() || undefined,
    validationRegistry: env.BOSSRAID_ERC8004_VALIDATION_REGISTRY?.trim() || undefined,
    validationTxs: validationTxs && validationTxs.length > 0 ? validationTxs : undefined,
    lastVerifiedAt: env.BOSSRAID_ERC8004_LAST_VERIFIED_AT?.trim() || undefined,
  };
}

export function readTeeSigner(env: NodeJS.ProcessEnv): {
  account: ReturnType<typeof mnemonicToAccount> | undefined;
  error: string | undefined;
} {
  const mnemonic = env.MNEMONIC?.trim();
  if (!mnemonic) {
    return {
      account: undefined,
      error: undefined,
    };
  }

  try {
    return {
      account: mnemonicToAccount(mnemonic),
      error: undefined,
    };
  } catch (error) {
    return {
      account: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readTeeSocketState(
  path: string
): Promise<{ pathExists: boolean; socketMounted: boolean }> {
  try {
    const stats = await stat(path);
    return {
      pathExists: true,
      socketMounted: stats.isSocket(),
    };
  } catch {
    return {
      pathExists: false,
      socketMounted: false,
    };
  }
}

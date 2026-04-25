import { writeFileSync } from "node:fs";
import { createPrivateKey, randomBytes } from "node:crypto";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

function main() {
  const clientPrivateKey = generatePrivateKey();
  const evaluatorPrivateKey = generatePrivateKey();
  const gammaPrivateKey = generatePrivateKey();
  const rikoPrivateKey = generatePrivateKey();
  const dottiePrivateKey = generatePrivateKey();

  const client = privateKeyToAccount(clientPrivateKey);
  const evaluator = privateKeyToAccount(evaluatorPrivateKey);
  const gamma = privateKeyToAccount(gammaPrivateKey);
  const riko = privateKeyToAccount(rikoPrivateKey);
  const dottie = privateKeyToAccount(dottiePrivateKey);

  const keys = {
    client: {
      address: client.address,
      privateKey: clientPrivateKey,
    },
    evaluator: {
      address: evaluator.address,
      privateKey: evaluatorPrivateKey,
    },
    providers: {
      "regression-averse-maintainer": {
        address: gamma.address,
        privateKey: gammaPrivateKey,
      },
      "minimal-diff-hunter": {
        address: riko.address,
        privateKey: rikoPrivateKey,
      },
      "unity-specialist-a": {
        address: dottie.address,
        privateKey: dottiePrivateKey,
      },
    },
  };

  const keysPath = "temp/settlement-keys.json";
  const envPath = "temp/settlement-keys.env";

  writeFileSync(keysPath, JSON.stringify(keys, null, 2), "utf8");

  const envLines = [
    `BOSSRAID_CLIENT_PRIVATE_KEY=${clientPrivateKey}`,
    `BOSSRAID_EVALUATOR_ADDRESS=${evaluator.address}`,
    `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY=${evaluatorPrivateKey}`,
    `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON=${JSON.stringify({
      "regression-averse-maintainer": gamma.address,
      "minimal-diff-hunter": riko.address,
      "unity-specialist-a": dottie.address,
    })}`,
    `BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON=${JSON.stringify({
      "regression-averse-maintainer": gammaPrivateKey,
      "minimal-diff-hunter": rikoPrivateKey,
      "unity-specialist-a": dottiePrivateKey,
    })}`,
  ];

  writeFileSync(envPath, envLines.join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    step: "keys_generated",
    keysPath,
    envPath,
    addresses: {
      client: client.address,
      evaluator: evaluator.address,
      gamma: gamma.address,
      riko: riko.address,
      dottie: dottie.address,
    },
    next: [
      `1. Fund ${client.address} with USDC on Base mainnet for escrow funding (~$10-50 worth)`,
      `2. Deploy settlement contracts: pnpm deploy:contracts`,
      `3. Update temp/settlement-keys.env with BOSSRAID_REGISTRY_ADDRESS and BOSSRAID_ESCROW_ADDRESS`,
      `4. Source temp/settlement-keys.env and start the API`,
      `5. Fund each provider wallet with ETH for gas (~$1 each)`,
    ],
  }, null, 2));
}

main();
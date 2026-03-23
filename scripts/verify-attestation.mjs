import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { recoverMessageAddress } from "viem";
import { loadLocalEnv } from "./env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

const args = parseArgs(process.argv.slice(2));
if (args.has("help")) {
  console.log([
    "Usage:",
    "  pnpm verify:attestation < response.json",
    "  pnpm verify:attestation -- --file ./temp/attested-result.json",
    "",
    "Options:",
    "  --file <path>",
    "  --type <auto|runtime|result>",
  ].join("\n"));
  process.exit(0);
}

const input = await readInput(readStringArg(args, "file"));
const envelope = parseEnvelope(input);
const attestationType = detectAttestationType(envelope);
const expectedType = readStringArg(args, "type") ?? "auto";

if (expectedType !== "auto" && expectedType !== attestationType) {
  throw new Error(`Expected attestation type ${expectedType} but received ${attestationType}.`);
}

const recoveredSigner = await recoverMessageAddress({
  message: envelope.message,
  signature: envelope.signature,
});
const signerMatches = equalAddress(recoveredSigner, envelope.signer);
const messageHash = hashText(envelope.message);
const messageHashMatches = messageHash === envelope.messageHash;
const resultHashMatches =
  attestationType === "result"
    ? hashText(stableStringify(envelope.payload.result)) === envelope.payload.resultHash
    : undefined;

if (!signerMatches) {
  throw new Error(`Recovered signer ${recoveredSigner} does not match envelope signer ${envelope.signer}.`);
}

if (!messageHashMatches) {
  throw new Error(`Message hash mismatch: expected ${messageHash}, received ${envelope.messageHash}.`);
}

if (resultHashMatches === false) {
  throw new Error(`Result hash mismatch: expected ${hashText(stableStringify(envelope.payload.result))}, received ${envelope.payload.resultHash}.`);
}

console.log(JSON.stringify({
  ok: true,
  type: attestationType,
  signer: envelope.signer,
  recoveredSigner,
  messageHash,
  messageHashMatches,
  resultHashMatches,
}, null, 2));

function parseEnvelope(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Attestation must be a JSON object.");
  }

  const envelope = value;
  if (
    typeof envelope.signer !== "string" ||
    typeof envelope.message !== "string" ||
    typeof envelope.messageHash !== "string" ||
    typeof envelope.signature !== "string" ||
    !envelope.payload ||
    typeof envelope.payload !== "object" ||
    Array.isArray(envelope.payload)
  ) {
    throw new Error("Attestation envelope is missing signer, message, messageHash, signature, or payload.");
  }

  return envelope;
}

function detectAttestationType(envelope) {
  if (envelope.message.startsWith("BossRaidAttestedRuntime|")) {
    return "runtime";
  }

  if (envelope.message.startsWith("BossRaidAttestedResult|")) {
    return "result";
  }

  throw new Error("Unsupported attestation message prefix.");
}

async function readInput(filePath) {
  if (filePath) {
    return readFile(resolve(process.cwd(), filePath), "utf8");
  }

  if (process.stdin.isTTY) {
    throw new Error("No attestation input provided. Pipe JSON into stdin or pass --file.");
  }

  return new Promise((resolveInput, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => resolveInput(raw));
    process.stdin.on("error", reject);
  });
}

function parseArgs(argv) {
  const result = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result.set(key, true);
      continue;
    }

    result.set(key, next);
    index += 1;
  }

  return result;
}

function readStringArg(argsMap, key) {
  const value = argsMap.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stableStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }

  return value;
}

function hashText(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function equalAddress(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

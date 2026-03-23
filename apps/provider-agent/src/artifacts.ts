import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { OutputType, SubmissionArtifact } from "@bossraid/shared-types";

export interface InlineArtifactFile {
  relativePath: string;
  mimeType: string;
  encoding: "base64";
  bytes: number;
  sha256: string;
  data: string;
}

export interface ArtifactBundleResult {
  artifactId: string;
  artifactRoot: string;
  files: InlineArtifactFile[];
}

export class ArtifactBuilder {
  private readonly artifactId: string;
  private readonly artifactRoot: string;
  private readonly files = new Map<string, { absolutePath: string; mimeType: string }>();

  constructor(prefix: string) {
    const safePrefix = prefix.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "artifact";
    this.artifactId = `${safePrefix}-${randomUUID()}`;
    this.artifactRoot = resolve(tmpdir(), "bossraid-provider-artifacts", this.artifactId);
    mkdirSync(this.artifactRoot, { recursive: true });
  }

  get root(): string {
    return this.artifactRoot;
  }

  writeText(relativePath: string, content: string, mimeType: string = "text/plain; charset=utf-8"): void {
    this.writeBinary(relativePath, Buffer.from(content, "utf8"), mimeType);
  }

  writeJson(relativePath: string, value: unknown): void {
    this.writeText(relativePath, JSON.stringify(value, null, 2) + "\n", "application/json");
  }

  writeBinary(relativePath: string, content: Buffer, mimeType: string): void {
    const absolutePath = resolve(this.artifactRoot, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
    this.files.set(relativePath, { absolutePath, mimeType });
  }

  inlineAll(): ArtifactBundleResult {
    return {
      artifactId: this.artifactId,
      artifactRoot: this.artifactRoot,
      files: [...this.files.entries()].map(([relativePath, file]) => {
        const buffer = readFileSync(file.absolutePath);
        return {
          relativePath,
          mimeType: file.mimeType,
          encoding: "base64" as const,
          bytes: buffer.byteLength,
          sha256: createHash("sha256").update(buffer).digest("hex"),
          data: buffer.toString("base64"),
        };
      }),
    };
  }
}

export function joinArtifactPath(...parts: string[]): string {
  return join(...parts);
}

export function buildDataUri(mimeType: string, buffer: Buffer): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function createBundleArtifact(
  bundle: ArtifactBundleResult,
  label: string,
  description: string,
): SubmissionArtifact {
  const payload = Buffer.from(JSON.stringify(bundle), "utf8");
  return {
    outputType: "bundle",
    label,
    uri: buildDataUri("application/json", payload),
    mimeType: "application/json",
    description,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
}

export function createFileArtifact(
  outputType: OutputType,
  label: string,
  description: string,
  file: InlineArtifactFile,
): SubmissionArtifact {
  return {
    outputType,
    label,
    uri: `data:${file.mimeType};base64,${file.data}`,
    mimeType: file.mimeType,
    description,
    sha256: file.sha256,
  };
}

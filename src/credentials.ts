import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * Read-only API-key resolution. The value is resolved fresh on every call and
 * is NEVER logged, persisted, or placed in any schema/presentation payload.
 *
 * Layer 1: the deployment's `credentials` service (`ctx.credentials`), which
 * hot-reloads `~/.dsh/.credentials.yaml` and enforces its own security
 * posture (0600, owner-only). Layer 2 (fallback, only when the service is not
 * mounted): a direct YAML read of `credentialPath` with the `yaml` package.
 * @module dsh-plugin-vision/credentials
 */
export interface CredentialConfig {
  /** Path to the credentials document; `~` is expanded to the home directory. */
  credentialPath: string;
  /** Candidate keys, tried in order; the first non-empty value wins. */
  credentialKeys: readonly string[];
}

/** Expand a leading `~` (or `~/`) to the current user's home directory. */
export function expandHome(filePath: string): string {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return join(homedir(), filePath.slice(2));
  return filePath;
}

interface CredentialsLike {
  resolve(ref: unknown): Promise<{ value?: unknown } | undefined>;
}

/**
 * Resolve the gateway API key for this call, or `undefined` when unconfigured.
 * Never throws for absent/malformed sources — a missing key degrades the VLM
 * channel to `ok:false` with a readable error instead of failing the tool.
 */
export async function resolveApiKey(
  ctx: { get(name: string): unknown },
  config: CredentialConfig,
): Promise<string | undefined> {
  const credentials = ctx.get("credentials") as CredentialsLike | undefined;
  if (credentials !== undefined) {
    for (const key of config.credentialKeys) {
      try {
        const resolved = await credentials.resolve(key);
        const value = resolved?.value;
        if (typeof value === "string" && value.length > 0) return value;
      } catch {
        // fall through to the next key
      }
    }
  }
  try {
    const document = parse(readFileSync(expandHome(config.credentialPath), "utf8")) as Record<string, unknown> | null;
    if (document !== null && typeof document === "object") {
      for (const key of config.credentialKeys) {
        const value = document[key];
        if (typeof value === "string" && value.length > 0) return value;
      }
    }
  } catch {
    // absent or unreadable document — treated as unconfigured
  }
  return undefined;
}

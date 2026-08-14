import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
/** Expand a leading `~` (or `~/`) to the current user's home directory. */
export function expandHome(filePath) {
    if (filePath === "~")
        return homedir();
    if (filePath.startsWith("~/"))
        return join(homedir(), filePath.slice(2));
    return filePath;
}
/**
 * Resolve the gateway API key for this call, or `undefined` when unconfigured.
 * Never throws for absent/malformed sources — a missing key degrades the VLM
 * channel to `ok:false` with a readable error instead of failing the tool.
 */
export async function resolveApiKey(ctx, config) {
    const credentials = ctx.get("credentials");
    if (credentials !== undefined) {
        for (const key of config.credentialKeys) {
            try {
                const resolved = await credentials.resolve(key);
                const value = resolved?.value;
                if (typeof value === "string" && value.length > 0)
                    return value;
            }
            catch {
                // fall through to the next key
            }
        }
    }
    try {
        const document = parse(readFileSync(expandHome(config.credentialPath), "utf8"));
        if (document !== null && typeof document === "object") {
            for (const key of config.credentialKeys) {
                const value = document[key];
                if (typeof value === "string" && value.length > 0)
                    return value;
            }
        }
    }
    catch {
        // absent or unreadable document — treated as unconfigured
    }
    return undefined;
}

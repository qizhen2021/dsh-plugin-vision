import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { applySeeTool, type SeeConfig, type SeeContext, type SeeRuntime } from "./see.js";
import { VISION_SETTINGS_NS, VisionSettingsSchema, type SettingsLike } from "./settings.js";

/**
 * dsh-plugin-vision — the `see` tool for the DeepSeek Harness.
 *
 * Package root exports only the Cordis plugin contract
 * (`name`, `inject`, `Config`, `apply`), like `@deepseek-ai/dsh-tool-fs`.
 * `apply` registers the model-facing `see` tool (offline OCR with positions +
 * ASCII layout art + vision-model description) and its system-prompt section.
 * Resources are located via `import.meta.url`, never the CWD.
 * @module dsh-plugin-vision
 */

export const name = "dsh-plugin-vision";

/** Services required by the tool suite (same set as `dsh-tool-fs`). */
export const inject = ["tools", "fs", "systemPrompt"];

const DEFAULTS: SeeConfig = {
  defaultModel: "mimo-v2.5",
  fallbackModels: ["qwen3.6-plus", "kimi-k3"],
  gatewayBaseUrl: "https://opencode.ai/zen/go/v1",
  credentialPath: "~/.dsh/.credentials.yaml",
  credentialKeys: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
  maxImageSide: 1600,
  asciiWidth: 88,
  vlmMaxTokens: 1200,
  vlmMaxChars: 4000,
  ocrTimeoutMs: 90000,
  asciiTimeoutMs: 30000,
  vlmTimeoutMs: 120000,
};

function schemaFor(value: unknown) {
  if (typeof value === "string") return z.string();
  if (typeof value === "number") return z.number();
  if (typeof value === "boolean") return z.boolean();
  if (Array.isArray(value)) return z.array(z.string());
  return z.any();
}

/** schemastery config schema; every key carries the shipped default. */
export const Config = z.object(
  Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, schemaFor(value).default(value)])),
);

/** Resolved plugin config (schema defaults applied); identical in shape to {@link SeeConfig}. */
export type Config = SeeConfig;

export function apply(ctx: SeeContext, config?: Partial<Config>): void {
  const resolved: SeeConfig = { ...DEFAULTS, ...(config ?? {}) };
  const runtime: SeeRuntime = { defaultModel: resolved.defaultModel };
  // Durable settings layer: schema defaults → composition base (loader config)
  // → user section (GUI edits). `watch` pushes GUI changes into the running
  // tool live; the namespace also survives restarts via the settings store.
  const settings = ctx.get("settings") as SettingsLike | undefined;
  if (settings !== undefined) {
    try {
      const scope = settings.register(VISION_SETTINGS_NS, VisionSettingsSchema, {
        base: { defaultModel: resolved.defaultModel },
        applies: "live",
      });
      runtime.defaultModel = scope.get().defaultModel;
      const watcher = () => scope.watch((next) => {
        runtime.defaultModel = next.defaultModel;
      });
      if (ctx.effect !== undefined) ctx.effect(watcher);
      else watcher();
    } catch (error) {
      console.error("[dsh-plugin-vision] settings registration failed:", error);
    }
  }
  applySeeTool(ctx, resolved, fileURLToPath(new URL("./resources/", import.meta.url)), runtime);
}

import z from "@deepseek-ai/schemastery";

/**
 * Durable settings surface for the vision-model default.
 *
 * The plugin registers namespace `dsh-plugin-vision` with `ctx.settings`;
 * the resolved value layers schema defaults → composition `base` (the loader
 * config, e.g. cordis.patch.yml) → the user document section (GUI / settings
 * edits). `applies: 'live'` + `watch` push GUI changes into the running tool
 * without a restart. Types are structural on purpose: the settings seam is
 * reached through `ctx.get('settings')` so this package adds no runtime
 * dependency (the public registry only carries an older
 * `@deepseek-ai/dsh-settings` line).
 * @module dsh-plugin-vision/settings
 */
export const VISION_SETTINGS_NS = "dsh-plugin-vision";

export const VisionSettingsSchema = z.object({
  defaultModel: z.string().default("mimo-v2.5"),
});

export interface VisionSettingsValue {
  defaultModel: string;
}

export interface SettingsScopeLike {
  get(): VisionSettingsValue;
  watch(callback: (next: VisionSettingsValue, prev: VisionSettingsValue) => void): () => void;
}

export interface SettingsLike {
  register(
    ns: string,
    schema: unknown,
    options?: { base?: Record<string, unknown>; applies?: string },
  ): SettingsScopeLike;
}

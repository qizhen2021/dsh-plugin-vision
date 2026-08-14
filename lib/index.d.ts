import z from "@deepseek-ai/schemastery";
import { type SeeConfig, type SeeContext } from "./see.js";
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
export declare const name = "dsh-plugin-vision";
/** Services required by the tool suite (same set as `dsh-tool-fs`). */
export declare const inject: string[];
/** schemastery config schema; every key carries the shipped default. */
export declare const Config: z<Schemastery.ObjectS<{
    [k: string]: z<string, string> | z<number, number> | z<boolean, boolean> | z<any, any> | z<string[], string[]>;
}>, Schemastery.ObjectT<{
    [k: string]: z<string, string> | z<number, number> | z<boolean, boolean> | z<any, any> | z<string[], string[]>;
}>>;
/** Resolved plugin config (schema defaults applied); identical in shape to {@link SeeConfig}. */
export type Config = SeeConfig;
export declare function apply(ctx: SeeContext, config?: Partial<Config>): void;

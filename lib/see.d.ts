/**
 * The model-facing `see` tool: three text channels over one image — offline
 * OCR with positions (macOS Vision), ASCII layout art (PIL), and a
 * vision-model semantic description (mimo-v2.5 via the opencode-go gateway,
 * with the OCR ground truth injected for exact strings). Unlike `read_image`,
 * `see` never requires the routed model to declare image input: its result is
 * plain text, so text-only models can analyze images.
 * @module dsh-plugin-vision/see
 */
export interface SeeConfig {
    defaultModel: string;
    fallbackModels: readonly string[];
    gatewayBaseUrl: string;
    credentialPath: string;
    credentialKeys: readonly string[];
    maxImageSide: number;
    asciiWidth: number;
    vlmMaxTokens: number;
    vlmMaxChars: number;
    ocrTimeoutMs: number;
    asciiTimeoutMs: number;
    vlmTimeoutMs: number;
}
/** Minimal structural view of the services this plugin consumes. */
export interface SeeContext {
    get(name: string): unknown;
    effect?(callback: () => () => void): void;
    fs: {
        resolve(path: string, opts?: {
            cwd?: string;
            signal?: AbortSignal;
        }): Promise<{
            displayPath: string;
        }>;
        stat(target: unknown, signal?: AbortSignal): Promise<{
            type: string;
        } | undefined>;
        readBytes(target: unknown, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
        processPath(target: unknown): string;
    };
    tools: {
        register(definition: unknown): () => void;
        get(name: string): unknown;
    };
    systemPrompt: {
        section(section: {
            name: string;
            order: number;
            text: string;
        }): () => void;
    };
}
/** Mutable per-run state; the settings watcher updates it live. */
export interface SeeRuntime {
    defaultModel: string;
}
export declare function applySeeTool(ctx: SeeContext, config: SeeConfig, resourceDir: string, runtime: SeeRuntime): void;

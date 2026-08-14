/**
 * Vision-model semantic channel. Preprocesses with `prep.py` (RGB → longest
 * side ≤ SEE_MAX_SIDE → JPEG q88), then calls the OpenAI-compatible gateway
 * with the **Node openai SDK** (Python clients are fingerprint-blocked by
 * Cloudflare — verified 1010). Falls back through the model chain; a model
 * whose content is empty falls back to `reasoning_content` (kimi quirk)
 * before it is considered failed. The OCR ground truth is injected by the
 * caller through `prompt` — never here, where the plain report prompt would
 * silently drop exact strings.
 * @module dsh-plugin-vision/vlm
 */
export declare const VLM_PROMPT: string;
export type VlmResult = {
    ok: true;
    model: string;
    text: string;
} | {
    ok: false;
    error: string;
};
export interface VlmOptions {
    /** Gateway API key; `undefined` degrades the channel with a readable error. */
    apiKey?: string;
    gatewayBaseUrl: string;
    imagePath: string;
    prepScriptPath: string;
    model: string;
    fallbackModels: readonly string[];
    prompt: string;
    maxTokens: number;
    maxChars: number;
    timeoutMs: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
}
export declare function runVlm(options: VlmOptions): Promise<VlmResult>;

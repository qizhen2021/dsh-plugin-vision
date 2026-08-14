import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { runScript } from "./run-script.js";

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
export const VLM_PROMPT = "You are a precise vision assistant. Look at the image and report:\n" +
  "1. TEXT — quote every visible string exactly (labels, titles, values, code).\n" +
  "2. LAYOUT — structure and arrangement of elements (positions, grouping).\n" +
  "3. UI — any buttons, inputs, lists, dialogs, and their approximate locations.\n" +
  "4. STYLE — colors, theme, density, visual feel.\n" +
  "5. NOTES — anything unusual, broken, empty, or notable.\n" +
  "Be factual and specific; say 'cannot determine' rather than guessing.";

export type VlmResult =
  | { ok: true; model: string; text: string }
  | { ok: false; error: string };

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

interface VlmMessage {
  content?: string | null;
  reasoning_content?: string | null;
}

export async function runVlm(options: VlmOptions): Promise<VlmResult> {
  if (options.apiKey === undefined) {
    return { ok: false, error: "no gateway API key configured (credentials service and the credentials document both have no value for the configured keys)" };
  }
  const prepped = join(tmpdir(), `dsh-vlm-${process.pid}-${Date.now()}.jpg`);
  const prep = await runScript({
    command: "python3",
    args: [options.prepScriptPath, options.imagePath, prepped],
    timeoutMs: Math.min(options.timeoutMs, 30000),
    signal: options.signal,
    env: options.env,
    missingHint: "install python3 with Pillow (`pip3 install Pillow`) to enable the VLM channel",
  });
  if (!prep.ok) return { ok: false, error: prep.error };
  try {
    const base64 = readFileSync(prepped).toString("base64");
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options.signal !== undefined) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    timeout.unref();
    try {
      const client = new OpenAI({ apiKey: options.apiKey, baseURL: options.gatewayBaseUrl, maxRetries: 0 });
      const models = [options.model, ...options.fallbackModels.filter((model) => model !== options.model)];
      const errors: string[] = [];
      for (const model of models) {
        try {
          const response = await client.chat.completions.create({
            model,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: options.prompt },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            }],
            max_tokens: options.maxTokens,
          }, { signal: controller.signal });
          const message = response.choices?.[0]?.message as VlmMessage | undefined;
          const text = (message?.content || message?.reasoning_content || "").trim();
          if (text.length === 0) throw new Error(`empty response from ${model}`);
          return { ok: true, model, text: text.slice(0, options.maxChars) };
        } catch (error) {
          errors.push(`${model}: ${String((error as Error | undefined)?.message ?? error).slice(0, 120)}`);
        }
      }
      return { ok: false, error: errors.join(" | ") };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    }
  } finally {
    rmSync(prepped, { force: true });
  }
}

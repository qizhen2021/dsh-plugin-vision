import { runScript } from "./run-script.js";

/**
 * ASCII layout-art channel. Spawns `python3 <resources/ascii.py> <image>` —
 * PIL grayscale, 88 columns, `' .:-=+*#%@'` gradient (' ' darkest, '@'
 * brightest). The channel degrades gracefully when python3/Pillow is absent.
 * @module dsh-plugin-vision/ascii
 */
export type AsciiResult =
  | { ok: true; art: string }
  | { ok: false; error: string };

export interface AsciiOptions {
  scriptPath: string;
  imagePath: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function runAscii(options: AsciiOptions): Promise<AsciiResult> {
  const result = await runScript({
    command: "python3",
    args: [options.scriptPath, options.imagePath],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    missingHint: "install python3 with Pillow (`pip3 install Pillow`) to enable the ASCII layout channel",
  });
  if (!result.ok) return result;
  return { ok: true, art: result.stdout.replace(/\s+$/, "") };
}

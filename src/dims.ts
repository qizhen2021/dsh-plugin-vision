import { resolvePython, runScript } from "./run-script.js";

/**
 * Image dimension probe. Primary: macOS `sips` (native, instant, no PIL
 * dependency). Fallback: `python3 <resources/dims.py>` (PIL). The probe is
 * the authoritative "can this image actually be decoded" check after the
 * extension + magic-byte validation; an undecodable file fails both probes.
 * @module dsh-plugin-vision/dims
 */
export interface ImageDims {
  width: number;
  height: number;
}

export type DimsResult =
  | { ok: true; width: number; height: number }
  | { ok: false; error: string };

export interface DimsOptions {
  scriptPath: string;
  imagePath: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const SIPS_WIDTH = /pixelWidth:\s*(\d+)/;
const SIPS_HEIGHT = /pixelHeight:\s*(\d+)/;

export function parseDimsOutput(stdout: string, source: "sips" | "pil"): DimsResult {
  if (source === "sips") {
    const width = SIPS_WIDTH.exec(stdout);
    const height = SIPS_HEIGHT.exec(stdout);
    if (width !== null && height !== null) {
      return { ok: true, width: Number(width[1]), height: Number(height[1]) };
    }
    return { ok: false, error: "sips returned no pixel dimensions" };
  }
  const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(stdout.trim());
  if (match !== null) {
    return { ok: true, width: Number(match[1]), height: Number(match[2]) };
  }
  return { ok: false, error: "PIL returned no pixel dimensions" };
}

export async function runDims(options: DimsOptions): Promise<DimsResult> {
  const sips = await runScript({
    command: "sips",
    args: ["-g", "pixelWidth", "-g", "pixelHeight", options.imagePath],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    missingHint: "sips is part of macOS",
  });
  if (sips.ok) {
    const parsed = parseDimsOutput(sips.stdout, "sips");
    if (parsed.ok) return parsed;
  }
  const pil = await runScript({
    command: resolvePython(),
    args: [options.scriptPath, options.imagePath],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    missingHint: "install python3 with Pillow (`pip3 install Pillow`)",
  });
  if (pil.ok) return parseDimsOutput(pil.stdout, "pil");
  return { ok: false, error: `cannot decode image dimensions: ${pil.error}`.slice(0, 300) };
}

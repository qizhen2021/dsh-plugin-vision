import { runScript } from "./run-script.js";

/**
 * macOS Vision OCR channel. Spawns `swift <resources/ocr.swift> <image>` and
 * parses `x y w h|text` lines. Coordinates are normalized percentages × 100
 * with the **y origin at the bottom** (Vision bounding-box convention);
 * output is sorted by y descending, then x ascending, so items read
 * top-to-bottom like the source layout.
 * @module dsh-plugin-vision/ocr
 */
export interface OcrItem {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export type OcrResult =
  | { ok: true; items: OcrItem[] }
  | { ok: false; error: string };

export interface OcrOptions {
  scriptPath: string;
  imagePath: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

const OCR_LINE = /^(\d+) (\d+) (\d+) (\d+)\|(.*)$/;

export function parseOcrOutput(stdout: string): OcrItem[] {
  const items: OcrItem[] = [];
  for (const line of stdout.split("\n")) {
    const match = OCR_LINE.exec(line.trim());
    if (match === null) continue;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const w = Number(match[3]);
    const h = Number(match[4]);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) continue;
    items.push({ x, y, w, h, text: match[5] });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  return items;
}

export async function runOcr(options: OcrOptions): Promise<OcrResult> {
  const result = await runScript({
    command: "swift",
    args: [options.scriptPath, options.imagePath],
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    missingHint: "install Xcode command-line tools (`xcode-select --install`) to enable offline OCR",
  });
  if (!result.ok) return result;
  return { ok: true, items: parseOcrOutput(result.stdout) };
}

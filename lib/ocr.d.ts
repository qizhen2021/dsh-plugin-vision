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
export type OcrResult = {
    ok: true;
    items: OcrItem[];
} | {
    ok: false;
    error: string;
};
export interface OcrOptions {
    scriptPath: string;
    imagePath: string;
    timeoutMs: number;
    signal?: AbortSignal;
}
export declare function parseOcrOutput(stdout: string): OcrItem[];
export declare function runOcr(options: OcrOptions): Promise<OcrResult>;

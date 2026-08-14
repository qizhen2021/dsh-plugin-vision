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
export type DimsResult = {
    ok: true;
    width: number;
    height: number;
} | {
    ok: false;
    error: string;
};
export interface DimsOptions {
    scriptPath: string;
    imagePath: string;
    timeoutMs: number;
    signal?: AbortSignal;
}
export declare function parseDimsOutput(stdout: string, source: "sips" | "pil"): DimsResult;
export declare function runDims(options: DimsOptions): Promise<DimsResult>;

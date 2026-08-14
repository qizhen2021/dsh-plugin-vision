/**
 * ASCII layout-art channel. Spawns `python3 <resources/ascii.py> <image>` —
 * PIL grayscale, 88 columns, `' .:-=+*#%@'` gradient (' ' darkest, '@'
 * brightest). The channel degrades gracefully when python3/Pillow is absent.
 * @module dsh-plugin-vision/ascii
 */
export type AsciiResult = {
    ok: true;
    art: string;
} | {
    ok: false;
    error: string;
};
export interface AsciiOptions {
    scriptPath: string;
    imagePath: string;
    timeoutMs: number;
    signal?: AbortSignal;
}
export declare function runAscii(options: AsciiOptions): Promise<AsciiResult>;

import { resolvePython, runScript } from "./run-script.js";
const SIPS_WIDTH = /pixelWidth:\s*(\d+)/;
const SIPS_HEIGHT = /pixelHeight:\s*(\d+)/;
export function parseDimsOutput(stdout, source) {
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
export async function runDims(options) {
    const sips = await runScript({
        command: "sips",
        args: ["-g", "pixelWidth", "-g", "pixelHeight", options.imagePath],
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        missingHint: "sips is part of macOS",
    });
    if (sips.ok) {
        const parsed = parseDimsOutput(sips.stdout, "sips");
        if (parsed.ok)
            return parsed;
    }
    const pil = await runScript({
        command: resolvePython(),
        args: [options.scriptPath, options.imagePath],
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        missingHint: "install python3 with Pillow (`pip3 install Pillow`)",
    });
    if (pil.ok)
        return parseDimsOutput(pil.stdout, "pil");
    return { ok: false, error: `cannot decode image dimensions: ${pil.error}`.slice(0, 300) };
}

import { runScript } from "./run-script.js";
const OCR_LINE = /^(\d+) (\d+) (\d+) (\d+)\|(.*)$/;
export function parseOcrOutput(stdout) {
    const items = [];
    for (const line of stdout.split("\n")) {
        const match = OCR_LINE.exec(line.trim());
        if (match === null)
            continue;
        const x = Number(match[1]);
        const y = Number(match[2]);
        const w = Number(match[3]);
        const h = Number(match[4]);
        if (![x, y, w, h].every((n) => Number.isFinite(n)))
            continue;
        items.push({ x, y, w, h, text: match[5] });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    return items;
}
export async function runOcr(options) {
    const result = await runScript({
        command: "swift",
        args: [options.scriptPath, options.imagePath],
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        missingHint: "install Xcode command-line tools (`xcode-select --install`) to enable offline OCR",
    });
    if (!result.ok)
        return result;
    return { ok: true, items: parseOcrOutput(result.stdout) };
}

import { runScript } from "./run-script.js";
export async function runAscii(options) {
    const result = await runScript({
        command: "python3",
        args: [options.scriptPath, options.imagePath],
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        missingHint: "install python3 with Pillow (`pip3 install Pillow`) to enable the ASCII layout channel",
    });
    if (!result.ok)
        return result;
    return { ok: true, art: result.stdout.replace(/\s+$/, "") };
}

import { spawn } from "node:child_process";
function describeSpawnError(command, error, missingHint) {
    const code = error?.code;
    if (code === "ENOENT")
        return `${command} not found — ${missingHint}`;
    return String(error?.message ?? error).slice(0, 300);
}
/**
 * Collapse a failure stream into one readable line: a Python traceback
 * reduces to its final exception line, and everything else is whitespace-
 * normalized, then capped at 300 characters (the task-book channel-error cap).
 */
function readableError(text) {
    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length > 0 && text.includes("Traceback (most recent call last)")) {
        return lines[lines.length - 1].slice(0, 300);
    }
    return text.trim().replace(/\s+/g, " ").slice(0, 300);
}
export function runScript(options) {
    const { command, args, timeoutMs, signal, env, missingHint, maxBytes = 64 * 1024 * 1024 } = options;
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"], env });
        }
        catch (error) {
            resolve({ ok: false, error: describeSpawnError(command, error, missingHint) });
            return;
        }
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(result);
        };
        child.stdout?.on("data", (chunk) => {
            if (stdout.length < maxBytes)
                stdout += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk) => {
            if (stderr.length < maxBytes)
                stderr += chunk.toString("utf8");
        });
        const onAbort = () => {
            // Best-effort tree kill: the channel processes (swift/python3) spawn no children.
            child.kill("SIGKILL");
        };
        if (signal !== undefined) {
            if (signal.aborted)
                onAbort();
            else
                signal.addEventListener("abort", onAbort, { once: true });
        }
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            const killer = setTimeout(() => child.kill("SIGKILL"), 2000);
            killer.unref();
        }, timeoutMs);
        timer.unref();
        child.once("error", (error) => {
            settle({ ok: false, error: describeSpawnError(command, error, missingHint) });
        });
        child.once("close", (exitCode) => {
            if (timedOut)
                return settle({ ok: false, error: `${command} timed out after ${timeoutMs}ms` });
            if (signal?.aborted)
                return settle({ ok: false, error: "cancelled" });
            if (exitCode !== 0) {
                return settle({ ok: false, error: readableError(stderr || stdout || `${command} exited with code ${exitCode ?? "unknown"}`) });
            }
            settle({ ok: true, stdout });
        });
    });
}

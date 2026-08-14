/**
 * Shared subprocess runner for the local channels (swift OCR, python3 ascii /
 * prep / dims). Every spawn carries the tool-execution signal — abort kills
 * the child — and a per-channel timeout that escalates SIGTERM → SIGKILL.
 * Failures (missing executable, nonzero exit, timeout, cancellation) resolve
 * as `{ ok:false, error }`; the caller decides whether the channel degrades
 * or the whole tool fails.
 * @module dsh-plugin-vision/run-script
 */
export interface RunScriptOptions {
    command: string;
    args: readonly string[];
    timeoutMs: number;
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    /** Human-readable hint appended when the executable cannot be spawned. */
    missingHint: string;
    /** Byte cap on each collected stream (bounded memory, like the reference script). */
    maxBytes?: number;
}
export type RunScriptResult = {
    ok: true;
    stdout: string;
} | {
    ok: false;
    error: string;
};
export declare function runScript(options: RunScriptOptions): Promise<RunScriptResult>;
